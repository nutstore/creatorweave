import type { Meta, StoryObj } from '@storybook/react'
import { BrandBadge } from './badge'

const meta: Meta<typeof BrandBadge> = {
  title: 'Brand/Badges',
  component: BrandBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof BrandBadge>

// 设计稿中的 Badges
export const Badges: Story = {
  name: 'Status Badges',
  render: () => (
    <div className="flex items-center gap-3">
      <BrandBadge variant="success">Success</BrandBadge>
      <BrandBadge variant="warning">Warning</BrandBadge>
      <BrandBadge variant="error">Error</BrandBadge>
      <BrandBadge variant="neutral">Neutral</BrandBadge>
    </div>
  ),
}

// 设计稿中的 Tags
export const Tags: Story = {
  name: 'Color Tags',
  render: () => (
    <div className="flex items-center gap-3">
      <BrandBadge type="tag" color="primary">Primary</BrandBadge>
      <BrandBadge type="tag" color="blue">Blue</BrandBadge>
      <BrandBadge type="tag" color="purple">Purple</BrandBadge>
      <BrandBadge type="tag" color="green">Green</BrandBadge>
      <BrandBadge type="tag" color="orange">Orange</BrandBadge>
      <BrandBadge type="tag" color="pink">Pink</BrandBadge>
    </div>
  ),
}
