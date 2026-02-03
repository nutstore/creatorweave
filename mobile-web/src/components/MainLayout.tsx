/**
 * MainLayout - 主布局容器
 * 整合 TopBar、内容区域和 BottomNav
 * Phase 5: Added i18n support
 */

import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { TopBar, type TopBarAction } from './TopBar'
import { BottomNav } from './BottomNav'
import { useRemoteStore } from '../store/remote.store'
import { useT } from '../i18n'

export interface MainLayoutProps {
  children?: ReactNode
  hideBottomNav?: boolean
  title?: string
  showBack?: boolean
  onBack?: () => void
  actions?: TopBarAction[]
}

export function MainLayout({
  children,
  hideBottomNav = false,
  title,
  showBack,
  onBack,
  actions,
}: MainLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { connectionState } = useRemoteStore()
  const t = useT()

  // 自动判断是否显示返回按钮：会话详情页和设置页显示
  const shouldShowBack = showBack !== undefined
    ? showBack
    : location.pathname.startsWith('/chats/') || location.pathname === '/settings'

  // 默认返回逻辑
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else if (location.pathname.startsWith('/chats/')) {
      navigate('/chats')
    } else if (location.pathname === '/settings') {
      navigate('/chats')
    } else {
      navigate(-1)
    }
  }

  // 会话详情页显示会话标题
  const pageTitle = title || (location.pathname.startsWith('/chats/') ? t('session.current') : '')

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      <TopBar
        title={pageTitle}
        showBack={shouldShowBack}
        onBack={handleBack}
        actions={actions}
      />
      <div className="flex-1 overflow-hidden">{children || <Outlet />}</div>
      {!hideBottomNav && connectionState === 'connected' && <BottomNav />}
    </div>
  )
}
