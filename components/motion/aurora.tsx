// Drifting colour fields + film grain. Pure CSS (transform-only), so it stays at 60fps.
export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <div className="aurora-orb a" />
      <div className="aurora-orb b" />
      <div className="aurora-orb c" />
      <div className="aurora-grain" />
    </div>
  );
}
