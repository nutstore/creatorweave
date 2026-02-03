import type { Meta, StoryObj } from '@storybook/react'
import { BrandToast } from './toast'

const meta: Meta<typeof BrandToast> = {
  title: 'Brand/Toasts',
  component: BrandToast,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof BrandToast>

export const Success: Story = {
  args: {
    variant: 'success',
    title: '操作成功',
    children: '文件已成功上传到服务器',
  },
}

export const Error: Story = {
  args: {
    variant: 'error',
    title: '操作失败',
    children: '上传失败，请稍后重试',
  },
}

export const Warning: Story = {
  args: {
    variant: 'warning',
    title: '警告',
    children: '您的账户即将到期，请及时续费',
  },
}

export const Info: Story = {
  args: {
    variant: 'info',
    title: '系统通知',
    children: '系统将于今晚 22:00 进行维护',
  },
}

export const WithoutIcon: Story = {
  args: {
    variant: 'success',
    title: '无图标样式',
    icon: false,
  },
}

export const ToastList: Story = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-md">
      <BrandToast variant="success" title="成功">操作成功完成</BrandToast>
      <BrandToast variant="error" title="错误">发生了一个错误</BrandToast>
      <BrandToast variant="warning" title="警告">请注意检查输入</BrandToast>
      <BrandToast variant="info" title="提示">这是一条提示信息</BrandToast>
    </div>
  ),
}
