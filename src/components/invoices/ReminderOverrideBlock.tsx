"use client";

import React from "react";

const REMINDER_DAY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];

type Props = {
  useCustomReminders: boolean;
  setUseCustomReminders: (value: boolean) => void;
  reminderDaysOverride: number[];
  setReminderDaysOverride: (days: number[]) => void;
};

// Extracted from InvoiceForm verbatim so it can be rendered both in the form
// view and in the canvas view's side rail without duplicating markup.
export function ReminderOverrideBlock({
  useCustomReminders,
  setUseCustomReminders,
  reminderDaysOverride,
  setReminderDaysOverride,
}: Props) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <input
          type="checkbox"
          checked={!useCustomReminders}
          onChange={(e) => {
            setUseCustomReminders(!e.target.checked);
            if (e.target.checked) setReminderDaysOverride([]);
          }}
          className="rounded"
        />
        Use org default reminder schedule
      </label>
      {useCustomReminders && (
        <div className="mt-2 flex flex-wrap gap-2 pl-1">
          {REMINDER_DAY_OPTIONS.map((d) => (
            <label
              key={d}
              className="flex items-center gap-1.5 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={reminderDaysOverride.includes(d)}
                onChange={(e) => {
                  setReminderDaysOverride(
                    e.target.checked
                      ? [...reminderDaysOverride, d].sort((a, b) => a - b)
                      : reminderDaysOverride.filter((x) => x !== d),
                  );
                }}
                className="rounded"
              />
              {d === 1 ? "1 day" : `${d} days`}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
