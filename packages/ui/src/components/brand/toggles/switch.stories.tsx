import type { Meta, StoryObj } from '@storybook/react'
import { BrandSwitch } from './switch'

const meta: Meta<typeof BrandSwitch> = {
  title: 'Brand/Switch',
  component: BrandSwitch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof BrandSwitch>

// Design spec: Toggles section showing all 3 states
export const DesignSpec: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      {/* Toggle / On */}
      <div className="flex items-center gap-3">
        <BrandSwitch defaultChecked />
        <span className="text-sm font-normal text-primary">Enabled</span>
      </div>

      {/* Toggle / Off */}
      <div className="flex items-center gap-3">
        <BrandSwitch />
        <span className="text-sm font-normal text-tertiary">Disabled</span>
      </div>

      {/* Toggle / Disabled */}
      <div className="flex items-center gap-3">
        <BrandSwitch disabled />
        <span className="text-sm font-normal text-tertiary">Locked</span>
      </div>
    </div>
  ),
}

export const On: Story = {
  args: {
    checked: true,
    defaultChecked: true,
  },
}

export const Off: Story = {
  args: {},
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
  },
}
