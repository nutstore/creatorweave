import type { Meta, StoryObj } from '@storybook/react'
import { BrandInput } from './input'

const meta: Meta<typeof BrandInput> = {
  title: 'Brand/Inputs',
  component: BrandInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof BrandInput>

// Design spec: All 5 input states side by side
export const DesignSpec: Story = {
  render: () => (
    <div className="flex gap-6">
      {/* Input / Default */}
      <div className="w-48">
        <BrandInput
          label="Label"
          placeholder="Placeholder..."
        />
      </div>

      {/* Input / Focused - simulate focus state */}
      <div className="w-48">
        <BrandInput
          label="Label"
          defaultValue="Input text"
          className="!border-primary-600 shadow-[0_0_6px_rgba(13,148,136,0.13)]"
        />
      </div>

      {/* Input / Filled */}
      <div className="w-48">
        <BrandInput
          label="Label"
          defaultValue="Session-2024-001"
        />
      </div>

      {/* Input / Error */}
      <div className="w-48">
        <BrandInput
          label="Label"
          defaultValue="Invalid input"
          error="This field is required"
        />
      </div>

      {/* Input / Disabled */}
      <div className="w-48">
        <BrandInput
          label="Label"
          defaultValue="Disabled"
          disabled
        />
      </div>
    </div>
  ),
}

export const Default: Story = {
  args: {
    label: 'Label',
    placeholder: 'Placeholder...',
  },
}

export const Focused: Story = {
  args: {
    label: 'Label',
    defaultValue: 'Input text',
    className: '!border-primary-600 shadow-[0_0_6px_rgba(13,148,136,0.13)]',
  },
}

export const Filled: Story = {
  args: {
    label: 'Label',
    defaultValue: 'Session-2024-001',
  },
}

export const Error: Story = {
  args: {
    label: 'Label',
    defaultValue: 'Invalid input',
    error: 'This field is required',
  },
}

export const Disabled: Story = {
  args: {
    label: 'Label',
    defaultValue: 'Disabled',
    disabled: true,
  },
}
