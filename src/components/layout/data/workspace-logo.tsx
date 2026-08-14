import alphaOneIconColor from '@/assets/logo/alpha-one-icon-color.png'

export function WorkspaceLogo({ className }: { className?: string }) {
  return (
    <img
      src={alphaOneIconColor}
      alt='Alpha One'
      className={className}
    />
  )
}
