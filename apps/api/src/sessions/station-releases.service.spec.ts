import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { StationReleasesService } from "./station-releases.service";

describe("StationReleasesService", () => {
  const signature = "ab".repeat(64);
  let releases: StationReleasesService;

  beforeEach(() => {
    releases = new StationReleasesService(new DatabaseService());
  });

  it("serves the newest release with the hash of exactly the bytes it stores", async () => {
    expect(await releases.latest()).toBeNull();
    await releases.publish("0.1.0", signature, Buffer.from("old build"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const binary = Buffer.from("new build");
    await releases.publish("0.2.0", signature, binary);

    const latest = await releases.latest();
    expect(latest).toMatchObject({ version: "0.2.0", size: binary.length, url: "/api/stations/release/0.2.0/Zen.exe" });
    expect(latest?.sha256).toBe(createHash("sha256").update(binary).digest("hex"));
    expect((await releases.binary("0.2.0")).equals(binary)).toBe(true);
    await expect(releases.binary("9.9.9")).rejects.toThrow(NotFoundException);
  });

  it("advertises the highest version even if an older one was uploaded later", async () => {
    await releases.publish("0.3.0", signature, Buffer.from("three"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await releases.publish("0.10.0", signature, Buffer.from("ten"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await releases.publish("0.2.1", signature, Buffer.from("hotfix for old"));
    expect((await releases.latest())?.version).toBe("0.10.0");
  });

  it("refuses a release without a proper version, signature or file", async () => {
    await expect(releases.publish("latest", signature, Buffer.from("x"))).rejects.toThrow(BadRequestException);
    await expect(releases.publish("1.0.0", "not-hex", Buffer.from("x"))).rejects.toThrow(BadRequestException);
    await expect(releases.publish("1.0.0", signature, Buffer.alloc(0))).rejects.toThrow(BadRequestException);
  });
});
