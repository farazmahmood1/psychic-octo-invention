import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui standard utility for merging Tailwind class names */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
