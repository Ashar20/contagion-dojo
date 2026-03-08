import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import './LandingPage.css';


function HeroDots() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    for (let i = 0; i < 30; i++) {
      const dot = document.createElement('div');
      dot.className = `landing-hero-dot ${Math.random() > 0.3 ? 'healthy' : 'infected'}`;
      dot.style.left = `${Math.random() * 100}%`;
      dot.style.top = `${40 + Math.random() * 50}%`;
      dot.style.animationDelay = `${Math.random() * 12}s`;
      dot.style.animationDuration = `${8 + Math.random() * 8}s`;
      el.appendChild(dot);
    }
    return () => {
      while (el.firstChild) el.removeChild(el.firstChild);
    };
  }, []);

  return <div ref={containerRef} className="landing-hero-dots" />;
}

export function LandingPage() {
  const navigate = useNavigate();
  const { isConnected, connectWallet } = useWallet();

  const handlePlay = async () => {
    if (isConnected) {
      navigate('/lobby');
    } else {
      try {
        await connectWallet();
        navigate('/lobby');
      } catch {
        // User cancelled wallet connection
      }
    }
  };

  return (
    <div className="landing-wrapper">

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-bg" />
        <h1 className="landing-hero-title">
          <span className="line2 text-4xl">Contagion</span>
          <span className="line1 text-2xl">Trust No One</span>
        </h1>
        <p className="landing-hero-sub text-white max-w-7xl mx-auto">
          A multiplayer social deduction game where infection spreads silently.
          Prove you&apos;re clean. Identify the infected. Survive.
          <br /> <strong> The server doesn&apos;t know who&apos;s sick.</strong>
        </p>
        <div className="landing-hero-actions">
          <button className="pixel-btn pixel-btn-large pixel-btn-green" onClick={handlePlay}>
            Enter the Room
          </button>
          <a href="#how" className="pixel-btn text-lg! pixel-btn-secondary" onClick={(e) => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }); }}>
            How It Works
          </a>
        </div>

      </section>

      {/* How It Works */}
      <section id="how" className="landing-section">
        <span className="landing-section-label">How It Works</span>
        <h2 className="landing-section-title">Simple mechanics.<br />Brutal paranoia.</h2>
        <p className="landing-section-desc">
          Drop in. Get a name. Move around. One player is secretly patient zero. Infection spreads by proximity. You only know you&apos;re safe if you can prove it.
        </p>
        <div className="landing-how-grid">
          <div className="pixel-card landing-how-card">
            <div className="landing-how-num">01</div>
            <h3>Drop In</h3>
            <p>Join the persistent room and receive a random codename. No signup. No rounds. The game is always running. You&apos;re a dot on a shared map with everyone else.</p>
          </div>
          <div className="pixel-card landing-how-card">
            <div className="landing-how-num">02</div>
            <h3>Infection Spreads</h3>
            <p>One player is secretly patient zero. Stand too close to the wrong person for too long, and you&apos;re infected. You&apos;ll know immediately — but nobody else will.</p>
          </div>
          <div className="pixel-card landing-how-card">
            <div className="landing-how-num">03</div>
            <h3>Prove or Perish</h3>
            <p>Walk to the testing camp to generate a cryptographic health proof. Flash it when accused. But the proof has a timestamp — and truth expires. How old is your proof?</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="landing-section">
        <span className="landing-section-label">Core Features</span>
        <h2 className="landing-section-title">Paranoia, engineered.</h2>
        <p className="landing-section-desc">
          Every mechanic is designed to create suspicion, force difficult decisions, and reward careful observation.
        </p>
        <div className="landing-features-grid">
          <div className="pixel-card landing-feature-card">
            <span className="landing-feature-icon">🔬</span>
            <h3>Testing Camp</h3>
            <p>Located dead center of the map. Generate a zero-knowledge proof of your health status. But walking to the center means walking through everyone else. Testing yourself is a risk.</p>
            <span className="landing-feature-tag">ZK Proof</span>
          </div>
          <div className="pixel-card landing-feature-card">
            <span className="landing-feature-icon">👁️</span>
            <h3>Proximity Intel</h3>
            <p>Click any player to see the last 6 names they&apos;ve been near. If a killed-infected player&apos;s name is on that list — you&apos;ve found a lead. Or a red herring.</p>
            <span className="landing-feature-tag">Investigation</span>
          </div>
          <div className="pixel-card landing-feature-card">
            <span className="landing-feature-icon">⚖️</span>
            <h3>Accusations</h3>
            <p>Accuse a player and their proof appears above their head for everyone to judge. Get 30% of players to vote them out. But if you&apos;re wrong, you lose points. Choose carefully.</p>
            <span className="landing-feature-tag">Social Deduction</span>
          </div>
          <div className="pixel-card landing-feature-card">
            <span className="landing-feature-icon">💀</span>
            <h3>Death & Rebirth</h3>
            <p>Voted out? You die, your status is revealed, and you respawn with a brand new name. Nobody knows you&apos;re the same player — but your old name haunts the proximity logs forever.</p>
            <span className="landing-feature-tag">Identity Reset</span>
          </div>
        </div>
      </section>

      {/* ZK Section */}
      <div className="landing-zk-section" id="zk">
        <div className="landing-zk-inner">
          <div className="landing-zk-grid">
            <div className="pixel-card landing-zk-visual">
              <div>
                <span className="landing-zk-lock">🛡️</span>
                <div className="landing-zk-proof-demo">
                  <div className="line"><span className="dim">$</span> generate_proof()</div>
                  <div className="line"><span className="dim">  player:</span> <span className="val">CrimsonBadger</span></div>
                  <div className="line"><span className="dim">  status:</span> <span className="val">HEALTHY</span></div>
                  <div className="line"><span className="dim">  tick:</span> <span className="val">48,291</span></div>
                  <div className="line"><span className="dim">  proof:</span> <span className="val">0x7f3a...c91d</span></div>
                  <div className="line"><span className="warn">  ⚠ valid at tick 48,291 only</span></div>
                </div>
              </div>
            </div>
            <div className="landing-zk-content">
              <span className="landing-section-label">Zero Knowledge</span>
              <div className="text-xl font-bold mb-2">The server doesn&apos;t know <em>who&apos;s infected.</em></div>
              <p>Your health status is private by default. The only way to prove you&apos;re clean is to walk to the testing camp and generate a cryptographic proof — verified by math, not trust.</p>
              <ul className="landing-zk-points">
                <li><strong>Proofs are timestamped.</strong> A proof from 2 minutes ago doesn&apos;t mean you&apos;re clean now.</li>
                <li><strong>No proof is a signal.</strong> If you can&apos;t prove you&apos;re healthy, others will notice.</li>
                <li><strong>Cryptographically verified.</strong> Nobody can forge a health proof. Not you. Not the server.</li>
                <li><strong>Privacy by design.</strong> Your status stays hidden until you choose to reveal it — or you&apos;re forced to.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Tagline strip */}
      <div className="landing-tagline-strip my-20 rounded-4xl">
        <blockquote>
          You were standing next to SilentOwl for 20 seconds.
          SilentOwl was <em>killed as infected</em> two minutes ago.
          When&apos;s the last time you tested?
        </blockquote>
        <cite>— Every accusation, ever</cite>
      </div>

      {/* Gameplay actions */}
      <section id="gameplay" className="landing-section">
        <span className="landing-section-label">Player Actions</span>
        <h2 className="landing-section-title">What you can do.</h2>
        <p className="landing-section-desc">Five actions. Infinite paranoia.</p>
        <div className="landing-gameplay-strip">
          <div className="pixel-card landing-gp-card">
            <span className="landing-gp-icon">🏃</span>
            <h4>Move</h4>
            <p>Real-time. Everyone sees your position. No hiding.</p>
          </div>
          <div className="pixel-card landing-gp-card">
            <span className="landing-gp-icon">🧪</span>
            <h4>Test</h4>
            <p>Walk to the camp. Get a health proof. 2-minute cooldown.</p>
          </div>
          <div className="pixel-card landing-gp-card">
            <span className="landing-gp-icon">🔍</span>
            <h4>Investigate</h4>
            <p>Click anyone. See their last 6 contacts. Find the trail.</p>
          </div>
          <div className="pixel-card landing-gp-card">
            <span className="landing-gp-icon">👆</span>
            <h4>Accuse</h4>
            <p>Point the finger. Their proof shows. The room votes.</p>
          </div>
          <div className="pixel-card landing-gp-card">
            <span className="landing-gp-icon">💎</span>
            <h4>Collect</h4>
            <p>Grab orbs around the map for points. Everyone&apos;s moving.</p>
          </div>
        </div>
      </section>

      {/* Scoring */}
      <section id="scoring" className="landing-section">
        <span className="landing-section-label">Scoring</span>
        <h2 className="landing-section-title">Points for playing smart.</h2>
        <p className="landing-section-desc">Healthy or infected, there&apos;s always something to gain — and something to lose.</p>
        <table className="landing-points-table">
          <thead>
            <tr><th>Action</th><th>Who</th><th>Points</th></tr>
          </thead>
          <tbody>
            <tr><td>Staying alive</td><td>Healthy</td><td className="pts-green">+1 per tick</td></tr>
            <tr><td>Successful accusation</td><td>Accuser</td><td className="pts-green">+ Bonus</td></tr>
            <tr><td>Infecting a player</td><td>Infected</td><td className="pts-red">+ Bonus per infection</td></tr>
            <tr><td>Collecting an orb</td><td>Anyone</td><td className="pts-yellow">+ Per orb</td></tr>
            <tr><td>Failed accusation</td><td>Accuser</td><td className="pts-red">- Penalty</td></tr>
          </tbody>
        </table>
      </section>

      {/* CTA */}
      <section className="landing-cta-section" id="play">
        <h2>Ready to drop in?</h2>
        <p>One room. One infection. No one you can trust.</p>
        <button className="pixel-btn pixel-btn-large pixel-btn-green" onClick={handlePlay}>
          Play Contagion
        </button>
        <p className="landing-stellar-badge">BUILT ON STARKNET</p>
      </section>
    </div>
  );
}
