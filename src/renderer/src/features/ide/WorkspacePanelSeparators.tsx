import { Separator } from 'react-resizable-panels'

export function WorkspaceColumnSeparator(): React.JSX.Element {
  return (
    <Separator className="flex w-1.5 shrink-0 items-center justify-center bg-transparent transition-colors hover:bg-primary/10 cursor-col-resize">
      <div className="h-10 w-0.5 rounded-full bg-border" />
    </Separator>
  )
}

export function WorkspaceRowSeparator(): React.JSX.Element {
  return (
    <Separator className="flex h-1.5 shrink-0 items-center justify-center bg-transparent transition-colors hover:bg-primary/10 cursor-row-resize">
      <div className="h-0.5 w-10 rounded-full bg-border" />
    </Separator>
  )
}
