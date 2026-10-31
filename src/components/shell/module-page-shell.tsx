"use client";

import React, { type ReactNode } from "react";
import { Column, Grid, Tag, Tile } from "@carbon/react";
import { APP_CONFIG } from "@/config/brand";
import { getRouteByPath } from "@/config/routes";

export interface ModulePageShellProps {
  routePath: string;
  subtitle?: string;
  children?: ReactNode;
}

export function ModulePageShell({
  routePath,
  subtitle,
  children,
}: ModulePageShellProps) {
  const route = getRouteByPath(routePath);
  const heading = route?.label ?? APP_CONFIG.brandName;
  const description = subtitle ?? route?.description ?? APP_CONFIG.tagline;

  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4}>
        <Tile
          data-testid={`module-header-${route?.id ?? "root"}`}
          style={{ marginBottom: "1.5rem", padding: "1.5rem" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "1.75rem",
                  fontWeight: 600,
                }}
              >
                {heading}
              </h1>
              {route?.badge ? (
                <Tag type="cool-gray" size="md">
                  {route.badge}
                </Tag>
              ) : (
                <Tag type="blue" size="sm" className="pncp-mono">
                  Módulo #{route?.order ?? 0}
                </Tag>
              )}
            </div>
          </div>
          <p
            style={{
              margin: 0,
              color: "var(--cds-text-secondary)",
              fontSize: "0.95rem",
            }}
          >
            {description}
          </p>
        </Tile>
      </Column>

      {children ? (
        <Column lg={16} md={8} sm={4}>
          {children}
        </Column>
      ) : null}
    </Grid>
  );
}
