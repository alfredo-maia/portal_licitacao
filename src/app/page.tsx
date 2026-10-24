"use client";

import React from "react";
import { ClickableTile, Column, Grid, Tag, Tile } from "@carbon/react";
import { APP_CONFIG } from "@/config/brand";
import { APP_ROUTES } from "@/config/routes";

export default function HomePage() {
  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4}>
        <Tile style={{ marginBottom: "1.5rem", padding: "1.5rem" }}>
          <h1 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
            {APP_CONFIG.brandName}
          </h1>
          <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
            {APP_CONFIG.tagline}
          </p>
        </Tile>
      </Column>

      {APP_ROUTES.map((route) => (
        <Column
          key={route.id}
          lg={4}
          md={4}
          sm={4}
          style={{ marginBottom: "1rem" }}
        >
          <ClickableTile href={route.path} style={{ height: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <strong>{route.label}</strong>
              {route.badge ? (
                <Tag size="sm" type="cool-gray">
                  {route.badge}
                </Tag>
              ) : (
                <Tag size="sm" type="blue" className="pncp-mono">
                  #{route.order}
                </Tag>
              )}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: "var(--cds-text-secondary)",
              }}
            >
              {route.description}
            </p>
          </ClickableTile>
        </Column>
      ))}
    </Grid>
  );
}
