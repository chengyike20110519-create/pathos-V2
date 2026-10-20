import { redirect } from "next/navigation";

// v2 keeps the launched map as the canonical map experience.
export default function Page() {
  redirect("/map");
}
