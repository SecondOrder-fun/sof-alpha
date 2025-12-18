/**
 * Temporary Landing Page for SecondOrder.fun
 * Matches the design of the existing secondorder.fun landing page
 */

import MeltyLines from "@/components/backgrounds/MeltyLines";
import AddMiniAppButton from "@/components/farcaster/AddMiniAppButton";
import useFarcasterSDK from "@/hooks/useFarcasterSDK";

const Landing = () => {
  // Initialize Farcaster SDK and call ready() to hide splash screen
  useFarcasterSDK();

  return (
    <div className="relative min-h-screen bg-[#0d0d0d]">
      {/* Animated Melty Lines Background */}
      <MeltyLines />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <img
            src="/images/logo.png"
            alt="SecondOrder.fun Logo"
            className="w-12 h-12"
          />
          <h1 className="text-2xl font-bold">
            <span className="text-white">Second</span>
            <span className="text-[#c82a54]">Order</span>
            <span className="text-[#a89e99]">.fun</span>
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex items-center justify-center px-4 py-12">
        <div
          className="w-full max-w-2xl mx-auto p-8 rounded-lg"
          style={{
            backgroundColor: "rgba(20, 20, 20, 0.9)",
            border: "1px solid #c82a54",
            boxShadow: "0 0 30px rgba(200, 42, 84, 0.2)",
          }}
        >
          <h2
            className="text-2xl font-bold mb-6 tracking-widest"
            style={{ color: "#c82a54", fontFamily: "monospace" }}
          >
            COMING SOON
          </h2>

          <p
            className="mb-8 leading-relaxed"
            style={{ color: "#a89e99", fontFamily: "monospace" }}
          >
            SecondOrder.fun transforms memecoins from chaotic infinite games
            into structured, fair finite games. Join our community and be the
            first to know when we launch.
          </p>

          <div className="mb-8">
            <h3
              className="text-lg font-semibold mb-4"
              style={{ color: "#e25167" }}
            >
              Memecoins without the hangover
            </h3>
            <ul
              className="space-y-2 text-sm"
              style={{ color: "#a89e99", fontFamily: "monospace" }}
            >
              <li>• Transparent raffle mechanics with clear rules</li>
              <li>• Time-limited seasons with defined outcomes</li>
              <li>• Second-order prediction markets</li>
              <li>• Fair play through game design</li>
            </ul>
          </div>

          {/* Add to Farcaster Button - only shows in Farcaster client */}
          <AddMiniAppButton className="mb-6" />

          {/* Social Links */}
          <div className="flex items-center justify-center gap-6 pt-6 border-t border-[#333]">
            <a
              href="https://twitter.com/SecondOrderfun"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-md transition-all hover:bg-[#c82a54]/20"
              style={{ color: "#a89e99" }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="text-sm font-medium">@SecondOrderfun</span>
            </a>

            <a
              href="https://warpcast.com/secondorderfun"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-md transition-all hover:bg-[#c82a54]/20"
              style={{ color: "#a89e99" }}
            >
              <svg
                viewBox="0 0 1000 1000"
                className="w-5 h-5"
                fill="currentColor"
              >
                <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
                <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
                <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
              </svg>
              <span className="text-sm font-medium">Farcaster</span>
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed z-10 bottom-0 left-0 right-0 py-6 text-center bg-[#0d0d0d]/80 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-6 mb-4">
          <a
            href="mailto:secondorder.fun@patrion.xyz"
            className="transition-colors hover:text-[#c82a54]"
            style={{ color: "#606060" }}
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
          </a>
          <a
            href="https://twitter.com/SecondOrderfun"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[#c82a54]"
            style={{ color: "#606060" }}
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://warpcast.com/secondorderfun"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[#c82a54]"
            style={{ color: "#606060" }}
          >
            <svg
              viewBox="0 0 1000 1000"
              className="w-6 h-6"
              fill="currentColor"
            >
              <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
              <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
              <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
            </svg>
          </a>
        </div>
        <p className="text-sm" style={{ color: "#606060" }}>
          &copy; 2025 SecondOrder.fun. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default Landing;
