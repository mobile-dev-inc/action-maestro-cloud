import { color } from 'console-log-colors'
const { red, green, yellowBright, gray, cyan } = color;

export const info = (msg: string) => {
  console.log(cyan(msg))
}

export const success = (msg: string) => {
  console.log(green(msg))
}

export const err = (msg: string) => {
  console.log(red(msg))
}

export const warning = (msg: string) => {
  console.log(yellowBright(msg))
}

export const canceled = (msg: string) => {
  console.log(gray(msg))
}