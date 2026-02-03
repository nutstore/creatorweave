import type { Meta, StoryObj } from '@storybook/react'
import { BrandCard, BrandCardHeader, BrandCardTitle, BrandCardDescription, BrandCardContent, BrandCardMetric, BrandCardFooter } from './card'

const meta: Meta<typeof BrandCard> = {
  title: 'Brand/Cards',
  component: BrandCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['metric', 'content', 'info'],
    },
  },
}

export default meta
type Story = StoryObj<typeof BrandCard>

// Design spec: Cards section showing all 3 variants
export const DesignSpec: Story = {
  render: () => (
    <div className="flex gap-5">
      {/* Card / Metric */}
      <BrandCard variant="metric" className="w-60">
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-semibold tracking-widest text-tertiary font-mono">
            TOTAL SESSIONS
          </span>
          <BrandCardMetric className="text-[36px]">2,847</BrandCardMetric>
          <div className="flex items-center gap-1">
            <span className="text-success text-[12px] font-semibold">↑</span>
            <span className="text-success text-[12px] font-medium font-mono">+12.5%</span>
            <span className="text-tertiary text-[12px]">vs last month</span>
          </div>
        </div>
      </BrandCard>

      {/* Card / Content */}
      <BrandCard variant="content" className="w-80">
        <div className="h-40 w-full bg-primary-50" />
        <div className="p-5 flex flex-col gap-2">
          <BrandCardTitle className="text-[20px]">Session Details</BrandCardTitle>
          <BrandCardDescription className="text-[13px] leading-[1.5]">
            View and manage your OPFS storage sessions with detailed analytics.
          </BrandCardDescription>
        </div>
        <BrandCardFooter>
          <span className="text-[13px] font-medium text-primary-600">View Details →</span>
        </BrandCardFooter>
      </BrandCard>

      {/* Card / Info */}
      <BrandCard variant="info" className="w-[280px]">
        <div className="flex items-center justify-between">
          <BrandCardTitle className="text-[18px]">Storage Status</BrandCardTitle>
          <span className="rounded-md bg-success-bg px-2.5 py-1 text-[11px] font-semibold text-success-text font-mono">
            Active
          </span>
        </div>
        <div className="h-px bg-gray-200 w-full" />
      </BrandCard>
    </div>
  ),
}

export const Metric: Story = {
  args: {
    variant: 'metric',
    className: 'w-60',
    children: (
      <>
        <span className="text-[10px] font-semibold tracking-widest text-tertiary font-mono">
          TOTAL SESSIONS
        </span>
        <BrandCardMetric className="text-[36px]">2,847</BrandCardMetric>
        <div className="flex items-center gap-1">
          <span className="text-success text-[12px] font-semibold">↑</span>
          <span className="text-success text-[12px] font-medium font-mono">+12.5%</span>
          <span className="text-tertiary text-[12px]">vs last month</span>
        </div>
      </>
    ),
  },
}

export const Content: Story = {
  args: {
    variant: 'content',
    className: 'w-80',
    children: (
      <>
        <div className="h-40 w-full bg-primary-50" />
        <div className="p-5 flex flex-col gap-2">
          <BrandCardTitle className="text-[20px]">Session Details</BrandCardTitle>
          <BrandCardDescription className="text-[13px] leading-[1.5]">
            View and manage your OPFS storage sessions with detailed analytics.
          </BrandCardDescription>
        </div>
        <BrandCardFooter>
          <span className="text-[13px] font-medium text-primary-600">View Details →</span>
        </BrandCardFooter>
      </>
    ),
  },
}

export const Info: Story = {
  args: {
    variant: 'info',
    className: 'w-[280px]',
    children: (
      <>
        <div className="flex items-center justify-between">
          <BrandCardTitle className="text-[18px]">Storage Status</BrandCardTitle>
          <span className="rounded-md bg-success-bg px-2.5 py-1 text-[11px] font-semibold text-success-text font-mono">
            Active
          </span>
        </div>
        <div className="h-px bg-gray-200 w-full" />
      </>
    ),
  },
}
