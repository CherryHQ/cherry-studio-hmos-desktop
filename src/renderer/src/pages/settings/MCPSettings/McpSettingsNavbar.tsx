import { NavbarRight } from '@renderer/components/app/Navbar'
import { HStack } from '@renderer/components/Layout'
import { isLinux, isWin } from '@renderer/config/constant'
import { useFullscreen } from '@renderer/hooks/useFullscreen'
import { Button, Dropdown, Menu, type MenuProps } from 'antd'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

// import InstallNpxUv from './InstallNpxUv'

export const McpSettingsNavbar = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const resourceMenuItems: MenuProps['items'] = mcpResources.map(({ name, url, logo }) => ({
    key: name,
    label: (
      <Menu.Item
        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        style={{ backgroundColor: 'transparent' }}
        icon={<img src={logo} alt={name} style={{ width: 20, height: 20, borderRadius: 5, marginRight: 10 }} />}>
        {name}
      </Menu.Item>
    )
  }))

  // 搜索Mcp、更多Mcp按钮
  return (
    <NavbarRight style={{ paddingRight: useFullscreen() ? '12px' : isWin ? 150 : isLinux ? 120 : 12 }}>
      <HStack alignItems="center" gap={5}>
        {/* 去掉搜索Mcp按钮 */}
        {/* <Button
          size="small"
          type="text"
          onClick={() => navigate('/settings/mcp/npx-search')}
          icon={<Search size={14} />}
          className="nodrag"
          style={{ fontSize: 13, height: 28, borderRadius: 20 }}>
          {t('settings.mcp.searchNpx')}
        </Button> */}
        <Dropdown menu={{ items: resourceMenuItems }} trigger={['click']}>
          <Button
            size="small"
            type="text"
            className="nodrag"
            style={{ fontSize: 13, height: 28, borderRadius: 20, display: 'flex', alignItems: 'center' }}>
            {t('settings.mcp.findMore')}
            <ChevronDown size={16} />
          </Button>
        </Dropdown>
        {/* <InstallNpxUv mini /> */}
      </HStack>
    </NavbarRight>
  )
}
