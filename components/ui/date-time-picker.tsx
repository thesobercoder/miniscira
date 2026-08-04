"use client"

import { RiCalendarLine, RiTimeLine } from "@remixicon/react"
import { format } from "date-fns"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { WheelPicker, WheelPickerWrapper } from "@/components/wheel-picker"
import { cn } from "@/lib/utils"

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const v = String(i).padStart(2, "0")
  return { value: v, label: v }
})
// 5-minute steps keep the wheel snappy; enough granularity for a schedule.
const MINUTES = Array.from({ length: 12 }, (_, i) => {
  const v = String(i * 5).padStart(2, "0")
  return { value: v, label: v }
})
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
].map((d, i) => ({ value: String(i), label: d.slice(0, 3) }))

export type DateTimePickerMode = "time" | "weekday" | "date"

/**
 * Schedule picker in three modes, all sharing a wheel-picker time selector:
 * - "time"    → time-only (daily schedules)
 * - "weekday" → weekday wheel + time (weekly schedules — a day, not a date)
 * - "date"    → shadcn Calendar + time, side by side (custom schedules)
 */
export function DateTimePicker({
  value,
  onChange,
  mode = "date",
  className,
}: {
  value: Date
  onChange: (date: Date) => void
  mode?: DateTimePickerMode
  className?: string
}) {
  const [open, setOpen] = React.useState(false)

  const hour = String(value.getHours()).padStart(2, "0")
  const minute = String((Math.round(value.getMinutes() / 5) * 5) % 60).padStart(
    2,
    "0"
  )
  const weekday = String(value.getDay())

  const setHour = (h: string) => {
    const next = new Date(value)
    next.setHours(Number.parseInt(h, 10), value.getMinutes(), 0, 0)
    onChange(next)
  }
  const setMinute = (m: string) => {
    const next = new Date(value)
    next.setHours(value.getHours(), Number.parseInt(m, 10), 0, 0)
    onChange(next)
  }
  // Shift the date to the chosen weekday (keeps the time).
  const setWeekday = (d: string) => {
    const next = new Date(value)
    next.setDate(next.getDate() + (Number.parseInt(d, 10) - next.getDay()))
    onChange(next)
  }
  const setDate = (d: Date | undefined) => {
    if (!d) return
    const next = new Date(d)
    next.setHours(value.getHours(), value.getMinutes(), 0, 0)
    onChange(next)
  }

  // Measured: the wheel's rendered height scales ~13.5px per visibleCount step
  // (5→27px, 9→81px); 14 ≈ 148px ≈ five 30px rows — the iOS-picker sweet spot.
  const timeWheels = (
    <>
      <WheelPicker
        options={HOURS}
        value={hour}
        onValueChange={setHour}
        infinite
        visibleCount={14}
      />
      <WheelPicker
        options={MINUTES}
        value={minute}
        onValueChange={setMinute}
        infinite
        visibleCount={14}
      />
    </>
  )

  const label =
    mode === "time"
      ? format(value, "HH:mm")
      : mode === "weekday"
        ? format(value, "EEE · HH:mm")
        : format(value, "EEE, MMM d · HH:mm")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn("h-9 justify-start gap-2 font-normal", className)}
          />
        }
      >
        {mode === "time" ? (
          <RiTimeLine className="size-4 shrink-0 opacity-60" />
        ) : (
          <RiCalendarLine className="size-4 shrink-0 opacity-60" />
        )}
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("p-0", mode === "date" ? "w-auto" : "w-64")}
      >
        {mode === "date" ? (
          // Calendar + time side by side, so the popover stays short.
          <div className="flex items-stretch">
            <Calendar
              mode="single"
              selected={value}
              onSelect={setDate}
              autoFocus
              className="p-2"
            />
            <div className="flex w-36 shrink-0 flex-col justify-center gap-2 border-l p-3">
              <span className="font-medium text-muted-foreground text-xs">
                Time
              </span>
              <WheelPickerWrapper className="w-full">
                {timeWheels}
              </WheelPickerWrapper>
            </div>
          </div>
        ) : (
          <div className="p-3">
            <div className="mb-2 font-medium text-muted-foreground text-xs">
              {mode === "weekday" ? "Day & time" : "Time"}
            </div>
            <WheelPickerWrapper className="w-full">
              {mode === "weekday" && (
                <WheelPicker
                  options={WEEKDAYS}
                  value={weekday}
                  onValueChange={setWeekday}
                  visibleCount={14}
                />
              )}
              {timeWheels}
            </WheelPickerWrapper>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
