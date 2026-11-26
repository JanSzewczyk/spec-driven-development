// The sdd mod. A plugin has one hooks module, and a module registers an event once without a
// matcher, so this file only composes the two parts: the doctor tool (./doctor.ts) and the board
// side panel (./board/register.ts). `options` are the plugin's userConfig values.
import { registerBoard, startBoard } from './board/register.ts'
import { registerDoctor, startDoctor } from './doctor.ts'

export function register(on, options: Record<string, unknown> = {}) {
  on('session.start', async ($, e, next) => {
    await startDoctor($)
    await startBoard($, options.show_board !== false)
    return next(e)
  })
  registerDoctor(on)
  registerBoard(on)
}
