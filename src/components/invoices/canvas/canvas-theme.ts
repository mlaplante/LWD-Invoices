import type { InvoiceTemplateConfig } from "@/server/services/invoice-template-config";

export type CanvasTheme = {
  cssVars: Record<string, string>;
  density: "normal" | "compact";
  headerStyle: "banded" | "ruled" | "plain";
};

// react-pdf built-in font names (see invoice-template-config FONT_MAP) → CSS stacks.
const CSS_FONT_STACKS: Record<string, string> = {
  Helvetica: "Helvetica, ui-sans-serif, Arial, sans-serif",
  "Times-Roman": "Georgia, 'Times New Roman', serif",
  Courier: "'Courier New', Courier, monospace",
};

const TEMPLATE_STYLE: Record<
  InvoiceTemplateConfig["template"],
  { headerStyle: CanvasTheme["headerStyle"]; density: CanvasTheme["density"] }
> = {
  modern: { headerStyle: "banded", density: "normal" },
  classic: { headerStyle: "ruled", density: "normal" },
  minimal: { headerStyle: "plain", density: "normal" },
  compact: { headerStyle: "ruled", density: "compact" },
};

export function buildCanvasTheme(config: InvoiceTemplateConfig): CanvasTheme {
  const { headerStyle, density } = TEMPLATE_STYLE[config.template];
  return {
    cssVars: {
      "--canvas-font": CSS_FONT_STACKS[config.fontFamily] ?? CSS_FONT_STACKS.Helvetica,
      "--canvas-accent": config.accentColor,
    },
    density,
    headerStyle,
  };
}
