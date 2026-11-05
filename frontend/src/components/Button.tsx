import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** PDS button. Sizes and colors follow the Figma "button" component. */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Solid blue: the main action on a screen. */
        primary: "border border-primary bg-primary text-white hover:border-primary-strong hover:bg-primary-strong",
        /** White with blue outline: secondary actions and card CTAs. */
        secondary: "border border-primary bg-white text-primary hover:bg-info-75",
        /** Text-only link style. */
        link: "rounded-sm px-0 text-primary hover:underline",
        /** Alfred gradient button. */
        ai: "bg-ai text-white shadow-lift hover:brightness-110",
        /** No border or fill until hovered: toolbar and icon actions. Pressed toggles turn blue. */
        ghost: "font-normal text-ink hover:bg-info-75 aria-pressed:bg-info-100 aria-pressed:text-primary",
      },
      size: {
        sm: "h-8 px-4 text-sm",
        md: "h-11 px-8 text-sm",
        lg: "h-12 px-8 text-base",
        /** Square icon-only button; give it an aria-label. */
        icon: "size-8 p-0 [&_svg]:size-4",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "lg" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
