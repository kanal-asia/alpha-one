import alphaWorkspaceWordmarkColor from '@/assets/logo/alpha-workspace-wordmark-color-cropped.png'

export function WorkspaceWordmark({ className }: { className?: string }) {
  return (
    <img
      src={alphaWorkspaceWordmarkColor}
      alt='Alpha Workspace'
      className={className ?? 'h-5 w-auto object-contain'}
    />
  )
}
