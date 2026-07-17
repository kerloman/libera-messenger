import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function connectSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', withCredentials: true })
  }
  return socket
}

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
