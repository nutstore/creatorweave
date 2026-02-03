import type { Meta, StoryObj } from '@storybook/react'
import { BrandCheckbox } from './checkbox'

const meta: Meta<typeof BrandCheckbox> = {
  title: 'Brand/Checkbox',
  component: BrandCheckbox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
  },
}

export default meta
type Story = StoryObj<typeof BrandCheckbox>

// Design spec: Checkboxes section
export const DesignSpec: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      {/* Checkbox / Checked */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <BrandCheckbox checked defaultChecked />
        <span className="text-sm font-normal text-primary">Auto-sync sessions</span>
      </label>

      {/* Checkbox / Unchecked */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <BrandCheckbox />
        <span className="text-sm font-normal text-tertiary">Compress data</span>
      </label>

      {/* Disabled */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <BrandCheckbox disabled />
        <span className="text-sm font-normal text-tertiary">Disabled option</span>
      </label>
    </div>
  ),
}

export const Checked: Story = {
  args: {
    checked: true,
    defaultChecked: true,
  },
}

export const Unchecked: Story = {
  args: {},
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
  },
}

export const WithLabel: Story = {
  render: () => (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <BrandCheckbox />
      <span className="text-sm font-normal text-tertiary">Remember my choice</span>
    </label>
  ),
}
