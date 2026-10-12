"use client";

type Props = {
  id: string;
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

export function RangeField({
  id,
  label,
  valueText,
  min,
  max,
  step,
  value,
  onChange,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex justify-between text-[17px]">
        <span>{label}</span>
        <span className="font-bold">{valueText}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}