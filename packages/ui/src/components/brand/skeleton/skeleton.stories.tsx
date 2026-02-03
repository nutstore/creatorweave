import type { Meta, StoryObj } from '@storybook/react'
import { BrandSkeleton } from './skeleton'

const meta: Meta<typeof BrandSkeleton> = {
  title: 'Brand/Skeleton',
  component: BrandSkeleton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'default', 'md', 'lg'],
    },
    rounded: {
      control: 'select',
      options: ['sm', 'default', 'md', 'full'],
    },
  },
}

export default meta
type Story = StoryObj<typeof BrandSkeleton>

// Design spec: Skeleton Loader
export const DesignSpec: Story = {
  render: () => (
    <div className="w-[300px] flex flex-col gap-2">
      <BrandSkeleton className="w-full" />
      <BrandSkeleton className="w-[200px]" />
      <BrandSkeleton className="w-[240px]" />
    </div>
  ),
}

export const Default: Story = {
  args: {},
}

export const Small: Story = {
  args: {
    size: 'sm',
  },
  render: (args) => <BrandSkeleton {...args} className="w-32" />,
}

export const Large: Story = {
  args: {
    size: 'lg',
  },
  render: (args) => <BrandSkeleton {...args} className="w-48" />,
}

export const Circle: Story = {
  args: {
    rounded: 'full',
  },
  render: (args) => <BrandSkeleton {...args} className="h-10 w-10" />,
}

// Card skeleton example
export const Card: Story = {
  render: () => (
    <div className="w-[300px] rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <BrandSkeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <BrandSkeleton className="h-3 w-24" />
          <BrandSkeleton className="h-3 w-16" size="sm" />
        </div>
      </div>
      <BrandSkeleton className="h-24 w-full" />
      <div className="space-y-2">
        <BrandSkeleton className="h-3 w-full" />
        <BrandSkeleton className="h-3 w-3/4" />
      </div>
    </div>
  ),
}
