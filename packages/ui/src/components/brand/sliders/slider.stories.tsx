import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { BrandSlider } from './slider'

const meta: Meta<typeof BrandSlider> = {
  title: 'Brand/Slider',
  component: BrandSlider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onValueChange: { action: 'changed' },
  },
}

export default meta
type Story = StoryObj<typeof BrandSlider>

// Design spec: Slider / Default
export const DesignSpec: Story = {
  render: () => (
    <div className="w-[300px]">
      <BrandSlider defaultValue={[60]} max={100} step={1} />
    </div>
  ),
}

export const Default: Story = {
  render: () => (
    <div className="w-[300px]">
      <BrandSlider defaultValue={[50]} />
    </div>
  ),
}

export const WithValue: Story = {
  render: () => (
    <div className="w-[300px] space-y-4">
      <div className="flex justify-between text-sm">
        <span className="text-secondary">Volume</span>
        <span className="font-medium">60%</span>
      </div>
      <BrandSlider defaultValue={[60]} />
    </div>
  ),
}

export const Range: Story = {
  render: () => (
    <div className="w-[300px] space-y-4">
      <div className="flex justify-between text-sm">
        <span className="text-secondary">Price Range</span>
        <span className="font-medium">$100 - $500</span>
      </div>
      <BrandSlider defaultValue={[100, 500]} max={1000} step={10} />
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="w-[300px] space-y-4">
      <div className="flex justify-between text-sm">
        <span className="text-secondary">Disabled</span>
        <span className="font-medium">50%</span>
      </div>
      <BrandSlider defaultValue={[50]} disabled />
    </div>
  ),
}

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState([50])

    return (
      <div className="w-[300px] space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Brightness</span>
          <span className="font-medium">{value[0]}%</span>
        </div>
        <BrandSlider
          value={value}
          onValueChange={setValue}
          max={100}
        />
      </div>
    )
  },
}

export const ControlledRange: Story = {
  render: () => {
    const [range, setRange] = useState([200, 800])

    return (
      <div className="w-[300px] space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Price Range</span>
          <span className="font-medium">${range[0]} - ${range[1]}</span>
        </div>
        <BrandSlider
          value={range}
          onValueChange={setRange}
          max={1000}
          step={10}
        />
      </div>
    )
  },
}
