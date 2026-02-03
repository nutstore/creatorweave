import type { Meta, StoryObj } from '@storybook/react'
import { BrandProgress } from './progress'

const meta: Meta<typeof BrandProgress> = {
  title: 'Brand/Progress',
  component: BrandProgress,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg'],
    },
    rounded: {
      control: 'select',
      options: ['sm', 'md', 'full'],
    },
  },
}

export default meta
type Story = StoryObj<typeof BrandProgress>

// Design spec: Progress / Default
export const DesignSpec: Story = {
  render: () => (
    <div className="w-[300px] space-y-6">
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Uploading...</span>
          <span className="font-medium">75%</span>
        </div>
        <BrandProgress value={75} />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Processing</span>
          <span className="font-medium">45%</span>
        </div>
        <BrandProgress value={45} />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Completed</span>
          <span className="font-medium">100%</span>
        </div>
        <BrandProgress value={100} />
      </div>
    </div>
  ),
}

export const Default: Story = {
  args: {
    value: 50,
    className: 'w-[300px]',
  },
}

export const Indeterminate: Story = {
  args: {
    className: 'w-[300px]',
  },
}

export const XS: Story = {
  args: {
    size: 'xs',
    value: 50,
    className: 'w-[300px]',
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
    value: 50,
    className: 'w-[300px]',
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    value: 50,
    className: 'w-[300px]',
  },
}

export const RoundedFull: Story = {
  args: {
    rounded: 'full',
    value: 50,
    className: 'w-[300px]',
  },
}
