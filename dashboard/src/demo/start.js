// Imported first by the demo's entry: the fake control server is in place
// before any module of the panel runs.
import { installDemo } from './install.js'

installDemo(window)
document.body.classList.add('is-demo')
