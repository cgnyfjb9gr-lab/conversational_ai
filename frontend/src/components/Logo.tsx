import logoMark from "@/assets/brand/logo-mark.svg";
import logoPrincipal from "@/assets/brand/logo-principal.svg";
import orb from "@/assets/brand/orb.svg";
import { cn } from "@/lib/cn";

/** Principal wordmark (Figma "Global nav" logo). */
export function PrincipalLogo({ className }: { className?: string }) {
  return <img src={logoPrincipal} alt="Principal" className={cn("h-9.75 w-33", className)} />;
}

/** Principal "P" mark, for small spaces such as the side rail. Decorative. */
export function PrincipalMark({ className }: { className?: string }) {
  return <img src={logoMark} alt="" className={cn("h-7 w-5.5", className)} />;
}

/** Alfred's orb (Figma AI home). Decorative. */
export function AlfredOrb({ className }: { className?: string }) {
  return <img src={orb} alt="" className={cn("size-15", className)} />;
}
