import { describe, expect, it } from "vitest";
import { getLanguageFromPath } from "../../src/lib/utils";

describe("getLanguageFromPath", () => {
  it("keeps the languages it always mapped", () => {
    expect(getLanguageFromPath("src/main.rs")).toBe("rust");
    expect(getLanguageFromPath("a/b/App.tsx")).toBe("typescript");
    expect(getLanguageFromPath("x.h")).toBe("cpp");
    expect(getLanguageFromPath("ci.yml")).toBe("yaml");
  });

  // Phase 8: Monaco ships tokenizers for these, but the map never named them,
  // so they rendered as plain text.
  it("maps languages Monaco supports but the old table missed", () => {
    expect(getLanguageFromPath("App.kt")).toBe("kotlin");
    expect(getLanguageFromPath("View.swift")).toBe("swift");
    expect(getLanguageFromPath("model.rb")).toBe("ruby");
    expect(getLanguageFromPath("index.php")).toBe("php");
    expect(getLanguageFromPath("schema.sql")).toBe("sql");
    expect(getLanguageFromPath("pom.xml")).toBe("xml");
    expect(getLanguageFromPath("main.c")).toBe("cpp");
    expect(getLanguageFromPath("Cargo.toml")).toBe("ini");
  });

  it("recognises Dockerfiles by name and is case-insensitive", () => {
    expect(getLanguageFromPath("docker/Dockerfile")).toBe("dockerfile");
    expect(getLanguageFromPath("Dockerfile.dev")).toBe("dockerfile");
    expect(getLanguageFromPath("README.MD")).toBe("markdown");
  });

  it("falls back to plain text", () => {
    expect(getLanguageFromPath("LICENSE")).toBe("plaintext");
    expect(getLanguageFromPath("data.unknownext")).toBe("plaintext");
  });
});
