/** @type {import('next').NextConfig} */
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "campus-timetable-intelligence";
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true" || process.env.GITHUB_PAGES === "true";
const basePath = isGitHubPagesBuild ? `/${repositoryName}` : "";

const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath
  }
};

export default nextConfig;
