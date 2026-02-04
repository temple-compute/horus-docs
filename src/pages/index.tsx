import type { ReactNode } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="https://forms.gle/MD1WUn76TCeKHc669"
          >
            Join the waitlist
          </Link>
        </div>
      </div>
    </header>
  );
}

function UnderConstruction() {
  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h2>🚧 Under Construction 🚧</h2>
      <p>
        We're working hard to bring you the best workflow manager experience.
        Stay tuned for updates and thank you for your patience!
      </p>
    </div>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Description will go into a meta tag in <head />"
    >
      <HomepageHeader />
      <main>
        <UnderConstruction />
      </main>
    </Layout>
  );
}
