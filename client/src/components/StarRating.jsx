import React, { useState } from 'react';

const LABELS = { 1: 'Bad', 2: 'Not Well', 3: 'Good', 4: 'Very Good', 5: 'Amazing' };

export default function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div className="stars">
      <div className="stars-row" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            className={`star ${n <= active ? 'on' : ''}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            ★
          </button>
        ))}
      </div>
      <div className="stars-label">{active ? LABELS[active] : 'Tap a star'}</div>
    </div>
  );
}
