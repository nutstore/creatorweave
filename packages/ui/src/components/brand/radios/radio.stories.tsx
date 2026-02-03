import type { Meta, StoryObj } from '@storybook/react'
import { BrandRadio, BrandRadioGroup } from './radio'

const meta: Meta<typeof BrandRadio> = {
  title: 'Brand/Radio',
  component: BrandRadio,
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
type Story = StoryObj<typeof BrandRadio>

// Design spec: Radios section
export const DesignSpec: Story = {
  render: () => (
    <BrandRadioGroup defaultValue="local">
      {/* Radio / Selected */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <BrandRadio value="local" />
        <span className="text-sm font-normal text-primary">Local storage</span>
      </label>

      {/* Radio / Unselected */}
      <label className="flex items-center gap-2.5 cursor-pointer mt-6">
        <BrandRadio value="cloud" />
        <span className="text-sm font-normal text-tertiary">Cloud storage</span>
      </label>
    </BrandRadioGroup>
  ),
}

export const Selected: Story = {
  render: () => (
    <BrandRadioGroup defaultValue="option1">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <BrandRadio value="option1" />
        <span className="text-sm font-normal text-primary">Selected</span>
      </label>
    </BrandRadioGroup>
  ),
}

export const Unselected: Story = {
  render: () => (
    <BrandRadioGroup>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <BrandRadio value="option1" />
        <span className="text-sm font-normal text-tertiary">Unselected</span>
      </label>
    </BrandRadioGroup>
  ),
}

export const Group: Story = {
  render: () => (
    <BrandRadioGroup defaultValue="option1" className="grid gap-2">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <BrandRadio value="option1" />
        <span className="text-sm font-normal">Option 1</span>
      </label>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <BrandRadio value="option2" />
        <span className="text-sm font-normal">Option 2</span>
      </label>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <BrandRadio value="option3" disabled />
        <span className="text-sm font-normal text-tertiary">Disabled</span>
      </label>
    </BrandRadioGroup>
  ),
}

export const Small: Story = {
  args: {
    size: 'sm',
  },
}
