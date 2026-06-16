import React, { useState } from 'react';
import StarRating from './StarRating.jsx';

export default function FeedbackModal({ onSubmit, onSkip, submitting }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <h2>How was your Agentforce experience today?</h2>
        <p className="modal-sub">Your rating helps us improve the agent.</p>

        <StarRating value={stars} onChange={setStars} />

        <textarea
          className="comment"
          placeholder="Leave a comment (optional)…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />

        <div className="modal-actions">
          <button className="btn ghost" onClick={onSkip} disabled={submitting}>
            Skip
          </button>
          <button
            className="btn primary"
            onClick={() => onSubmit(stars, comment)}
            disabled={!stars || submitting}
          >
            {submitting ? 'Sending…' : 'Submit feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}
