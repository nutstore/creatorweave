import type { Meta, StoryObj } from '@storybook/react'
import { BrandAvatar, BrandAvatarGroup } from './avatar'

const meta: Meta<typeof BrandAvatar> = {
  title: 'Brand/Avatar',
  component: BrandAvatar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    status: {
      control: 'select',
      options: ['online', 'busy', 'offline', undefined],
    },
    variant: {
      control: 'select',
      options: ['primary', 'gray', 'success'],
    },
  },
}

export default meta
type Story = StoryObj<typeof BrandAvatar>

// ========== Sizes ==========
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar size="xs" fallback="XS" />
        <span className="text-xs text-secondary">XS 24px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar size="sm" fallback="SM" />
        <span className="text-xs text-secondary">SM 32px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar size="md" fallback="MD" />
        <span className="text-xs text-secondary">MD 40px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar size="lg" fallback="LG" />
        <span className="text-xs text-secondary">LG 48px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar size="xl" fallback="XL" />
        <span className="text-xs text-secondary">XL 64px</span>
      </div>
    </div>
  ),
}

// ========== With Initials ==========
export const WithInitials: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <BrandAvatar fallback="AB" />
      <BrandAvatar fallback="CD" variant="gray" />
      <BrandAvatar fallback="EF" variant="success" />
      <BrandAvatar fallback="+1" size="lg" />
    </div>
  ),
}

// ========== With Image ==========
export const WithImage: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <BrandAvatar
        src="https://i.pravatar.cc/150?img=1"
        alt="User 1"
      />
      <BrandAvatar
        src="https://i.pravatar.cc/150?img=2"
        alt="User 2"
        fallback="JD"
      />
      <BrandAvatar
        src="https://i.pravatar.cc/150?img=3"
        alt="User 3"
        size="lg"
      />
    </div>
  ),
}

// ========== Status ==========
export const Status: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar fallback="AB" status="online" />
        <span className="text-xs text-secondary">Online</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar fallback="CD" status="busy" />
        <span className="text-xs text-secondary">Busy</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar fallback="EF" status="offline" />
        <span className="text-xs text-secondary">Offline</span>
      </div>
    </div>
  ),
}

// ========== Status With Image ==========
export const StatusWithImage: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar
          src="https://i.pravatar.cc/150?img=4"
          alt="Online"
          fallback="AB"
          status="online"
        />
        <span className="text-xs text-secondary">Online</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar
          src="https://i.pravatar.cc/150?img=5"
          alt="Busy"
          fallback="CD"
          status="busy"
        />
        <span className="text-xs text-secondary">Busy</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <BrandAvatar
          src="https://i.pravatar.cc/150?img=6"
          alt="Offline"
          fallback="EF"
          status="offline"
        />
        <span className="text-xs text-secondary">Offline</span>
      </div>
    </div>
  ),
}

// ========== Avatar Group ==========
export const Group: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-secondary">Stacked Group</span>
        <BrandAvatarGroup max={4} total={8}>
          <BrandAvatar src="https://i.pravatar.cc/150?img=10" alt="User 1" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=11" alt="User 2" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=12" alt="User 3" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=13" alt="User 4" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=14" alt="User 5" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=15" alt="User 6" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=16" alt="User 7" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=17" alt="User 8" />
        </BrandAvatarGroup>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-secondary">With Initials</span>
        <BrandAvatarGroup max={3} total={5}>
          <BrandAvatar fallback="AB" />
          <BrandAvatar fallback="CD" />
          <BrandAvatar fallback="EF" />
          <BrandAvatar fallback="GH" />
          <BrandAvatar fallback="IJ" />
        </BrandAvatarGroup>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-secondary">Large Size</span>
        <BrandAvatarGroup size="lg" max={3} total={6}>
          <BrandAvatar src="https://i.pravatar.cc/150?img=20" alt="User 1" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=21" alt="User 2" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=22" alt="User 3" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=23" alt="User 4" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=24" alt="User 5" />
        </BrandAvatarGroup>
      </div>
    </div>
  ),
}

// ========== Design Spec ==========
export const DesignSpec: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-6">
      {/* Sizes */}
      <div>
        <p className="text-xs font-semibold text-secondary mb-4 tracking-wider">AVATAR SIZES</p>
        <div className="flex items-end gap-4">
          <BrandAvatar size="xs" fallback="XS" />
          <BrandAvatar size="sm" fallback="SM" />
          <BrandAvatar size="md" fallback="MD" />
          <BrandAvatar size="lg" fallback="LG" />
          <BrandAvatar size="xl" fallback="XL" />
        </div>
      </div>

      {/* With Initials & Status */}
      <div>
        <p className="text-xs font-semibold text-secondary mb-4 tracking-wider">AVATAR WITH INITIALS & STATUS</p>
        <div className="flex items-center gap-4">
          <BrandAvatar size="lg" fallback="JD" />
          <BrandAvatar size="lg" fallback="AB" status="online" />
          <BrandAvatar size="lg" fallback="CD" status="busy" />
          <BrandAvatar size="lg" fallback="EF" status="offline" />
        </div>
      </div>

      {/* Avatar Group */}
      <div>
        <p className="text-xs font-semibold text-secondary mb-4 tracking-wider">AVATAR GROUP</p>
        <BrandAvatarGroup max={4} total={8} size="lg">
          <BrandAvatar src="https://i.pravatar.cc/150?img=30" alt="User 1" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=31" alt="User 2" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=32" alt="User 3" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=33" alt="User 4" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=34" alt="User 5" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=35" alt="User 6" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=36" alt="User 7" />
          <BrandAvatar src="https://i.pravatar.cc/150?img=37" alt="User 8" />
        </BrandAvatarGroup>
      </div>
    </div>
  ),
}
