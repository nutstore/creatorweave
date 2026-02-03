import type { Meta, StoryObj } from '@storybook/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

const meta: Meta<typeof Tabs> = {
  title: 'Brand/Tabs',
  component: Tabs,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Tabs>

export const Underline: Story = {
  args: {
    defaultValue: 'tab1',
    children: (
      <>
        <TabsList variant="underline">
          <TabsTrigger value="tab1">概览</TabsTrigger>
          <TabsTrigger value="tab2">详情</TabsTrigger>
          <TabsTrigger value="tab3">设置</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">
          <p className="p-4">概览内容区域</p>
        </TabsContent>
        <TabsContent value="tab2">
          <p className="p-4">详情内容区域</p>
        </TabsContent>
        <TabsContent value="tab3">
          <p className="p-4">设置内容区域</p>
        </TabsContent>
      </>
    ),
  },
}

export const Segment: Story = {
  args: {
    defaultValue: 'tab1',
    children: (
      <>
        <TabsList variant="segment">
          <TabsTrigger variant="segment" value="tab1">日</TabsTrigger>
          <TabsTrigger variant="segment" value="tab2">周</TabsTrigger>
          <TabsTrigger variant="segment" value="tab3">月</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">
          <p className="p-4">日数据内容</p>
        </TabsContent>
        <TabsContent value="tab2">
          <p className="p-4">周数据内容</p>
        </TabsContent>
        <TabsContent value="tab3">
          <p className="p-4">月数据内容</p>
        </TabsContent>
      </>
    ),
  },
}
