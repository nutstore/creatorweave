import type { Meta, StoryObj } from '@storybook/react'
import { X } from 'lucide-react'
import {
  BrandDialog,
  BrandDialogTrigger,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogBody,
  BrandDialogFooter,
  BrandDialogClose,
  BrandDialogTitle,
  BrandDialogDescription,
  BrandButton,
} from '../index'

const meta: Meta<typeof BrandDialog> = {
  title: 'Brand/Dialog',
  component: BrandDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof BrandDialog>

// Design spec: Modal / Confirm
export const Confirm: Story = {
  render: () => (
    <BrandDialog>
      <BrandDialogTrigger asChild>
        <BrandButton variant="primary">Open Confirm Dialog</BrandButton>
      </BrandDialogTrigger>
      <BrandDialogContent>
        <BrandDialogHeader>
          <BrandDialogTitle>Confirm Action</BrandDialogTitle>
          <BrandDialogClose asChild>
            <button className="text-tertiary hover:text-primary transition-colors">
              <X className="h-5 w-5" />
            </button>
          </BrandDialogClose>
        </BrandDialogHeader>
        <BrandDialogBody>
          <p className="text-sm text-secondary">
            Are you sure you want to proceed with this action? This will permanently delete the selected items.
          </p>
        </BrandDialogBody>
        <BrandDialogFooter>
          <BrandDialogClose asChild>
            <BrandButton variant="outline">Cancel</BrandButton>
          </BrandDialogClose>
          <BrandButton variant="primary">Confirm</BrandButton>
        </BrandDialogFooter>
      </BrandDialogContent>
    </BrandDialog>
  ),
}

// Design spec: Modal / Destructive
export const Destructive: Story = {
  render: () => (
    <BrandDialog>
      <BrandDialogTrigger asChild>
        <BrandButton variant="danger">Delete Item</BrandButton>
      </BrandDialogTrigger>
      <BrandDialogContent>
        <BrandDialogHeader>
          <BrandDialogTitle>Delete Item</BrandDialogTitle>
          <BrandDialogClose asChild>
            <button className="text-tertiary hover:text-primary transition-colors">
              <X className="h-5 w-5" />
            </button>
          </BrandDialogClose>
        </BrandDialogHeader>
        <BrandDialogBody>
          <p className="text-sm text-secondary">
            This action cannot be undone. All associated data will be permanently removed.
          </p>
        </BrandDialogBody>
        <BrandDialogFooter>
          <BrandDialogClose asChild>
            <BrandButton variant="outline">Cancel</BrandButton>
          </BrandDialogClose>
          <BrandButton variant="danger">Delete</BrandButton>
        </BrandDialogFooter>
      </BrandDialogContent>
    </BrandDialog>
  ),
}

export const WithDescription: Story = {
  render: () => (
    <BrandDialog>
      <BrandDialogTrigger asChild>
        <BrandButton variant="primary">Open Dialog</BrandButton>
      </BrandDialogTrigger>
      <BrandDialogContent>
        <BrandDialogHeader>
          <BrandDialogTitle>Update Settings</BrandDialogTitle>
          <BrandDialogClose asChild>
            <button className="text-tertiary hover:text-primary transition-colors">
              <X className="h-5 w-5" />
            </button>
          </BrandDialogClose>
        </BrandDialogHeader>
        <BrandDialogBody>
          <BrandDialogDescription asChild>
            <p className="text-sm text-secondary">
              Configure your application settings below. Changes will be saved automatically.
            </p>
          </BrandDialogDescription>
          <div className="flex flex-col gap-2 mt-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span className="text-sm">Enable notifications</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span className="text-sm">Auto-save changes</span>
            </label>
          </div>
        </BrandDialogBody>
        <BrandDialogFooter>
          <BrandDialogClose asChild>
            <BrandButton variant="outline">Cancel</BrandButton>
          </BrandDialogClose>
          <BrandButton variant="primary">Save Changes</BrandButton>
        </BrandDialogFooter>
      </BrandDialogContent>
    </BrandDialog>
  ),
}
