import { hueOf, initials } from '../data'

export function Avatar({
  name,
  seed,
  avatar,
  size = 52,
  online,
}: {
  name: string
  seed?: string
  avatar?: string | null
  size?: number
  online?: boolean
}) {
  const hue = hueOf(seed ?? name)
  return (
    <div className="avatar-wrap" style={{ width: size, height: size }}>
      {avatar ? (
        <img className="avatar avatar-img" src={avatar} alt="" style={{ width: size, height: size }} />
      ) : (
        <div
          className="avatar"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.36,
            background: `linear-gradient(140deg, hsl(${hue} 82% 64%), hsl(${(hue + 42) % 360} 78% 52%))`,
          }}
        >
          {initials(name) || '?'}
        </div>
      )}
      {online && <span className="online-dot" style={{ width: size * 0.26, height: size * 0.26 }} />}
    </div>
  )
}
