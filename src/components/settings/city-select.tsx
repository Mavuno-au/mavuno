import { Select } from "@/components/ui/field";
import type { City } from "@/lib/data/shell";

export function CitySelect({ cities, value, onChange, id, name }: { cities: City[]; value: number | null; onChange?: (cityId: number | null) => void; id: string; name?: string }) {
  const states = [...new Set(cities.map((city) => city.state))].sort();
  return (
    <Select
      id={id}
      name={name}
      value={onChange ? (value ?? "") : undefined}
      defaultValue={onChange ? undefined : (value ?? "")}
      onChange={onChange ? (event) => onChange(event.target.value ? Number(event.target.value) : null) : undefined}
    >
      <option value="">Not shown</option>
      {states.map((state) => (
        <optgroup key={state} label={state}>
          {cities
            .filter((city) => city.state === state)
            .map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}
