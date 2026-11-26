// Surface module of a task row on Desktop: the whole row is one press target. Desktop's native Button is
// only as wide as its text and draws its own outline under the pointer, so the row takes the pointer
// itself and posts the task id to the hooks module (board/register.ts, `ui.message`).

type RowProps = { id: string; title: string; meta: string; metaColor: string | null; isDone: boolean }
type RowState = { isHovered: boolean }

export default function TaskRow(props: RowProps, surface: any) {
  const { Box, Text } = surface.elements
  const isHovered = surface.state?.isHovered === true
  surface.onPointer((e: { type: string; button?: string }) => {
    if (e.type === 'enter' || e.type === 'leave') {
      const next = e.type === 'enter'
      if (next !== isHovered) surface.setState({ isHovered: next } satisfies RowState)
    }
    if (e.type === 'up' && e.button === 'left') surface.post({ toggle: props.id })
  })
  return Box({
    flexDirection: 'row', columnGap: 1, alignItems: 'center', flexGrow: 1, flexShrink: 1, minWidth: 0,
    children: [
      Text({ mono: true, size: 'footnote', dimColor: true, underline: isHovered, children: [props.id] }),
      Box({ flexGrow: 1, flexShrink: 1, minWidth: 0, flexDirection: 'row', children: [Text({ size: 'footnote', dimColor: props.isDone, underline: isHovered, wrap: 'truncate-end', children: [props.title] })] }),
      props.meta ? Text({ size: 'caption', color: props.metaColor ?? undefined, dimColor: !props.metaColor, wrap: 'truncate-end', children: [props.meta] }) : null,
    ].filter(Boolean),
  })
}
