import React from 'react'
import './styles/false-friend.css'

export default function FalseFriendGame() {
  return (
    <div className="ff-root">
      <div className="ff-hero">
        <h1 className="ff-title">False Friend</h1>
        <p className="ff-subtitle">Scaffold loaded. Next: start + countdown + rounds.</p>
        <button className="ff-start" type="button">Start</button>
      </div>
    </div>
  )
}