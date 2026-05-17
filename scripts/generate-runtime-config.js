const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "js", "runtime-config.js");
const katagoApiUrl =
  process.env.NEXT_PUBLIC_KATAGO_API_URL ||
  process.env.BADUK_AI_API_URL ||
  "";

const contents = `(function () {
  window.BadukConfig = {
    katagoApiUrl: ${JSON.stringify(katagoApiUrl)},
  };
})();
`;

fs.writeFileSync(outputPath, contents);
console.log(
  katagoApiUrl
    ? "Runtime config generated with KataGo API URL."
    : "Runtime config generated without KataGo API URL. Fallback AI will be used.",
);
