"use client";

import { useEffect, useRef, useState } from "react";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";

import { Slider } from "@/components/ui/slider";
import { valuePulseAnimation } from "@/lib/animations";
import { useReducedMotion } from "@/lib/use-reduced-motion";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export function PropertySlider({ label, value, min, max, step, onChange }: Props) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const [displayValue, setDisplayValue] = useState(value);
  const reducedMotion = useReducedMotion();

  useEffect(() => setDisplayValue(value), [value]);

  const handleChange = ([nextValue]: number[]) => {
    setDisplayValue(nextValue);
    onChange(nextValue);
    if (!reducedMotion) lottieRef.current?.goToAndPlay(0, true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium">{label}</label>
        <div className="relative min-w-12 rounded border bg-muted/50 px-2 py-0.5 text-center text-xs tabular-nums">
          {displayValue}
          {!reducedMotion && (
            <Lottie
              lottieRef={lottieRef}
              animationData={valuePulseAnimation}
              autoplay={false}
              loop={false}
              className="pointer-events-none absolute -inset-2"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
      <Slider
        value={[displayValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={handleChange}
        aria-label={label}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
