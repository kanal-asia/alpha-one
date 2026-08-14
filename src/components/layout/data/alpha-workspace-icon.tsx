import alphaWorkspaceIconColor from '@/assets/logo/alpha-workspace-icon-color.png'

export function AlphaWorkspaceIcon({ className }: { className?: string }) {
  return (
    <img
      src={alphaWorkspaceIconColor}
      alt='Alpha Workspace'
      className={className ?? 'size-4 shrink-0 object-contain'}
    />
  )
}
