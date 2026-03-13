import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { RemoteDialog, RemoteDialogContent } from '@creatorweave/ui'
import { BrandButton } from '@creatorweave/ui'

const meta: Meta<typeof RemoteDialogContent> = {
  title: 'Brand/Dialogs/Remote',
  component: RemoteDialogContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof RemoteDialogContent>

export const Connected: Story = {
  render: () => {
    const [open, setOpen] = useState(true)

    return (
      <RemoteDialog
        open={open}
        onOpenChange={setOpen}
        relayUrl="wss://relay.example.com"
        onRelayUrlChange={(v) => console.log('Relay URL:', v)}
        sessionId="a7f3-b2c1"
        onCopySessionId={() => console.log('Copy session ID')}
        connected={true}
        connectedDevices={1}
        onDisconnect={() => console.log('Disconnect')}
      />
    )
  },
}

export const Disconnected: Story = {
  render: () => {
    const [open, setOpen] = useState(true)

    return (
      <RemoteDialog
        open={open}
        onOpenChange={setOpen}
        relayUrl="wss://relay.example.com"
        onRelayUrlChange={(v) => console.log('Relay URL:', v)}
        sessionId="a7f3-b2c1"
        onCopySessionId={() => console.log('Copy session ID')}
        connected={false}
        connectedDevices={0}
        onDisconnect={() => console.log('Disconnect')}
      />
    )
  },
}

export const MultipleDevices: Story = {
  render: () => {
    const [open, setOpen] = useState(true)

    return (
      <RemoteDialog
        open={open}
        onOpenChange={setOpen}
        relayUrl="wss://relay.example.com"
        onRelayUrlChange={(v) => console.log('Relay URL:', v)}
        sessionId="x9k2-m4p8"
        onCopySessionId={() => console.log('Copy session ID')}
        connected={true}
        connectedDevices={3}
        onDisconnect={() => console.log('Disconnect')}
      />
    )
  },
}

export const WithTrigger: Story = {
  render: () => {
    const [open, setOpen] = useState(false)

    return (
      <>
        <BrandButton variant="primary" onClick={() => setOpen(true)}>
          远程控制
        </BrandButton>
        <RemoteDialog
          open={open}
          onOpenChange={setOpen}
          relayUrl="wss://relay.example.com"
          onRelayUrlChange={(v) => console.log('Relay URL:', v)}
          sessionId="a7f3-b2c1"
          onCopySessionId={() => {
            navigator.clipboard.writeText('a7f3-b2c1')
            console.log('Copied!')
          }}
          connected={true}
          connectedDevices={1}
          onDisconnect={() => {
            console.log('Disconnect')
            setOpen(false)
          }}
        />
      </>
    )
  },
}

export const DesignSpec: Story = {
  render: () => (
    <div className="flex items-center justify-center min-h-[600px] bg-gray-50">
      <RemoteDialogContent
        relayUrl="wss://relay.example.com"
        onRelayUrlChange={(v) => console.log('Relay URL:', v)}
        sessionId="a7f3-b2c1"
        onCopySessionId={() => console.log('Copy session ID')}
        connected={true}
        connectedDevices={1}
        onDisconnect={() => console.log('Disconnect')}
      />
    </div>
  ),
}
