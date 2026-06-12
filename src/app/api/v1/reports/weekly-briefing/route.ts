import { NextRequest, NextResponse } from "next/server";
import { withV1Auth } from "../../auth";
import { jsonWithETag } from "../../etag";
import { callGeminiWithModelFallback, extractGeminiText, resolveGeminiModels } from "@/server/services/gemini-fallback";
import { db } from "@/server/db";
import { InvoiceStatus } from "@/generated/prisma";

// Helper to get the current week's start and end dates (Monday-Sunday)
function getCurrentWeekDates() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
  const startOfWeek = new Date(now);
  startOfWeek.setUTCDate(now.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
  
  return {
    weekStart: startOfWeek,
    weekEnd: endOfWeek,
  };
}

export async function GET(req: NextRequest) {
  return withV1Auth(req, async ({ orgId }) => {
    try {
      // Get current week dates
      const { weekStart, weekEnd } = getCurrentWeekDates();
      
      // Fetch cash in (payments this week)
      const paymentsThisWeek = await db.payment.findMany({
        where: {
          organizationId: orgId,
          paidAt: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
        select: {
          amount: true,
          method: true,
          invoiceId: true,
          paidAt: true,
        },
      });
      
      // Fetch cash out (expenses this week)
      const expensesThisWeek = await db.expense.findMany({
        where: {
          organizationId: orgId,
          createdAt: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
        select: {
          id: true,
          name: true,
          rate: true,
          qty: true,
          createdAt: true,
          categoryId: true,
        },
      });
      
      // Fetch overdue invoices
      const overdueInvoices = await db.invoice.findMany({
        where: {
          organizationId: orgId,
          isArchived: false,
          status: InvoiceStatus.OVERDUE,
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
            },
          },
          currency: {
            select: {
              code: true,
              symbol: true,
              symbolPosition: true,
            },
          },
        },
        orderBy: { dueDate: "asc" },
      });
      
      // Fetch upcoming renewals (recurring invoices in the next 2 weeks)
      const upcomingRenewals = await db.recurringInvoice.findMany({
        where: {
          organizationId: orgId,
          isActive: true,
          nextRunAt: {
            gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 2 weeks ago to cover edge cases
            lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
          },
        },
        include: {
          invoice: {
            select: {
              clientId: true,
              number: true,
              client: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });
      
      // Calculate totals
      const totalCashIn = paymentsThisWeek.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalCashOut = expensesThisWeek.reduce((sum, e) => sum + Number(e.rate) * e.qty, 0);
      
      // Calculate overdue risk
      const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
      const topOverdueClients = overdueInvoices
        .reduce((acc: Record<string, { clientId: string; clientName: string; amount: number; daysOverdue: number }>, inv) => {
          if (!inv.client) return acc;
          const daysOverdue = Math.floor((new Date().getTime() - (inv.dueDate?.getTime() || 0)) / (24 * 60 * 60 * 1000));
          const existing = acc[inv.client.id];
          if (existing) {
            existing.amount += Number(inv.total);
            existing.daysOverdue = Math.max(existing.daysOverdue, daysOverdue);
          } else {
            acc[inv.client.id] = {
              clientId: inv.client.id,
              clientName: inv.client.name,
              amount: Number(inv.total),
              daysOverdue: daysOverdue,
            };
          }
          return acc;
        }, {});
      
      // Convert to array and sort by amount
      const topOverdueClientsArray = Object.values(topOverdueClients).sort((a, b) => b.amount - a.amount).slice(0, 3);
      
      // Detect expense anomalies (expenses > $1000 or expenses that are outliers)
      const expenseAnomalies = expensesThisWeek
        .filter(e => Number(e.rate) * e.qty > 1000)
        .map(e => ({
          expenseId: e.id,
          description: e.name,
          amount: Number(e.rate) * e.qty,
          reason: "High-value expense (>$1000)",
        }));
      
      // Prepare minimal data for AI provider - only aggregate facts and compact evidence
      const aiPromptData = {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        totalCashIn: totalCashIn,
        totalCashOut: totalCashOut,
        netCashFlow: totalCashIn - totalCashOut,
        totalOverdue: totalOverdue,
        overdueInvoiceCount: overdueInvoices.length,
        topOverdueClients: topOverdueClientsArray.map(c => ({
          name: c.clientName,
          amount: c.amount,
          daysOverdue: c.daysOverdue,
        })),
        highValueExpenses: expenseAnomalies.map(e => ({
          description: e.description,
          amount: e.amount,
        })),
        upcomingRenewalsCount: upcomingRenewals.length,
        upcomingRenewals: upcomingRenewals.map(r => ({
          clientId: r.invoice.clientId,
          nextRunAt: r.nextRunAt.toISOString(),
          invoiceNumber: r.invoice.number,
        })),
      };
      
      // Use existing Gemini fallback chain for AI-powered recommendations
      const geminiModels = resolveGeminiModels(
        process.env.GEMINI_MODELS,
        ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
      );
      
      // Generate recommendations using existing AI provider
      let recommendations = [];
      try {
        const response = await callGeminiWithModelFallback({
          apiKey: process.env.GEMINI_API_KEY || "",
          models: geminiModels,
          body: {
            contents: [{
              parts: [{
                text: `Based on the following weekly business data, provide 2-3 actionable recommendations:

{${JSON.stringify(aiPromptData)}}

Requirements:
- Recommendations must be grounded ONLY in the data provided
- Do NOT invent numbers or facts
- Be specific and actionable
- Focus on cash flow, collections, and expense management
- Prioritize items that impact cash flow most
`,
              }],
            }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 500,
            },
          },
          onOk: (json: Record<string, unknown>) => {
            const text = extractGeminiText(json);
            try {
              // Try to parse as JSON array
              return JSON.parse(text) as Array<{ action: string; evidence: string; priority?: string }>;
            } catch {
              // If not JSON, return as text
              return [{ action: text.trim(), evidence: "AI-generated recommendation" }];
            }
          },
          label: "weekly-briefing",
        });
        
        recommendations = response;
      } catch (error) {
        console.error("AI recommendation generation failed:", error);
        // Provide fallback recommendations based on data
        recommendations = [
          {
            action: "Focus on collections - you have $",
            evidence: `overdue invoices totaling $${totalOverdue.toFixed(2)} across ${overdueInvoices.length} invoices`,
            priority: "high",
          },
          {
            action: "Review high-value expenses - ",
            evidence: `${expenseAnomalies.length} expenses exceed $1000 this week`,
            priority: "medium",
          },
        ];
        
        // Add renewal reminder if applicable
        if (upcomingRenewals.length > 0) {
          recommendations.push({
            action: "Prepare for upcoming contract renewals - ",
            evidence: `${upcomingRenewals.length} contracts renew in the next 2 weeks`,
            priority: "medium",
          });
        }
        
        // Add cash flow insight
        if (totalCashIn < totalCashOut) {
          recommendations.push({
            action: "Monitor cash flow - ",
            evidence: `Outflows ($${totalCashOut.toFixed(2)}) exceed inflows ($${totalCashIn.toFixed(2)}) by $${(totalCashOut - totalCashIn).toFixed(2)} this week`,
            priority: "high",
          });
        }
      }
      
      const response = {
        weekStart,
        weekEnd,
        cashIn: Math.round(totalCashIn * 100) / 100,
        cashOut: Math.round(totalCashOut * 100) / 100,
        overdueInvoiceRisk: {
          totalOverdue: Math.round(totalOverdue * 100) / 100,
          count: overdueInvoices.length,
          topOverdueClients: topOverdueClientsArray,
        },
        expenseAnomalies,
        upcomingRenewals: upcomingRenewals.map(r => ({
          id: r.id,
          clientId: r.invoice.clientId,
          clientName: r.invoice.client?.name ?? "Unknown client",
          nextRunAt: r.nextRunAt,
          invoiceNumber: r.invoice.number,
        })),
        recommendations,
        generatedAt: new Date(),
        metadata: {
          aiProvider: geminiModels[0],
          modelUsed: geminiModels[0],
          hasEmptyData: paymentsThisWeek.length === 0 && expensesThisWeek.length === 0 && overdueInvoices.length === 0,
        },
      };
      
      return jsonWithETag(req, response);
    } catch (error) {
      console.error("Weekly briefing endpoint error:", error);
      return NextResponse.json(
        { error: "Failed to generate weekly briefing", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  });
}
