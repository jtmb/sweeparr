import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
        watched: 'border-transparent bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        unwatched: 'border-transparent bg-rose-500/20 text-rose-400 border-rose-500/30',
        in_progress: 'border-transparent bg-amber-500/20 text-amber-400 border-amber-500/30',
        now_playing: 'border-transparent bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        candidate: 'border-transparent bg-orange-500/20 text-orange-400 border-orange-500/30',
        protected: 'border-transparent bg-slate-500/20 text-slate-400 border-slate-500/30',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
