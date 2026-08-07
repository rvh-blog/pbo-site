import { notFound } from "next/navigation";
import { DevDamageCalculator } from "./dev-damage-calculator";

export const dynamic = "force-dynamic";

export default function DevDamageCalculatorPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <DevDamageCalculator />;
}
