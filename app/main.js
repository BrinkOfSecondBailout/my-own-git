const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { createHash } = require('crypto');

const command = process.argv[2];

switch (command) {
    case "init":
        createGitDirectory();
        break;
    case "cat-file":
        viewObject();
        break;
    case "hash-object":
        computeHash();
        break;
    case "ls-tree":
        inspectTree();
        break;
    case "write-tree":
        writeTree();
        break;
    case "commit-tree":
        commitTree();
        break;
    case "clone":
        gitClone();
        break;
    default:
        throw new Error(`Unknown command ${command}`);
}

function gitClone() {
    
}

function commitTree() {
    const treeSha = process.argv[3];
    const message = process.argv.slice(process.argv.indexOf('-m'), process.argv.indexOf('-m') + 2)[1];
    const parentSha = process.argv.slice(process.argv.indexOf('-p'), process.argv.indexOf('-p')+2)[1];
    const commitContent = Buffer.concat([
        Buffer.from(`tree ${treeSha}\n`),
        parentSha ? Buffer.from(`parent ${parentSha}\n`) : Buffer.alloc(0),
        Buffer.from(`author Danny Nguyen <danny@gmail.com> ${Math.floor(Date.now() / 1000)}\n`),
        Buffer.from(`committer Danny Nguyen <danny@gmail.com> ${Math.floor(Date.now() / 1000)}\n\n`),
        Buffer.from(`${message}\n`)
    ]);

    const commitHeader = Buffer.from(`commit ${commitContent.length}\0`);
    const commitBuffer = Buffer.concat([commitHeader, commitContent]);

    const commitHash = generateHash(commitBuffer);

    writeObject(commitHash, commitBuffer);
    process.stdout.write(commitHash);
}

function writeTree() {
    const hash = writeTreeForPath(".");
    process.stdout.write(hash);
}

function writeTreeForPath(filePath) {
    const dirContent = fs.readdirSync(filePath);
    const entries = dirContent.filter((name) => name !== ".git" && name !== "main.js")
        .map((name) => {
            const fullPath = path.join(filePath, name);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                return ["40000", name, writeTreeForPath(fullPath)];
            } else if (stat.isFile()) {
                return ["100644", name, saveFileAsBlob(fullPath)];
            }
            return null;
        })
        .filter(entry => entry !== null)
        .sort((a, b) => a[1] - b[1])
        .reduce((acc, [mode, name, hash]) => {
            return Buffer.concat([acc, Buffer.from(`${mode} ${name}\x00`), Buffer.from(hash, "hex")]);
        }, Buffer.alloc(0));

    const tree = Buffer.concat([Buffer.from(`tree ${entries.length}\x00`), entries]);
    const hash = generateHash(tree);

    writeObject(hash, tree);
    return hash;
}

function writeObject(hashCode, content) {
    const dir = path.join(process.cwd(), ".git", "objects", hashCode.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, hashCode.slice(2)), zlib.deflateSync(content));
}

function saveFileAsBlob(filePath) {
    const data = `blob ${fs.statSync(filePath).size}\x00${fs.readFileSync(filePath)}`;
    const hashCode = generateHash(data);
    writeObject(hashCode, data);
    return hashCode;
}

function readObject(hashCode) {
    const raw = fs.readFileSync(path.join(process.cwd(), ".git", "objects", hashCode.slice(0, 2), hashCode.slice(2)));
    const decompressed = zlib.inflateSync(raw);
    return decompressed.toString();
}

function inspectTree() {
    const flag = process.argv[3];
    const hash = process.argv[4];
    const decompressedTree = readObject(hash).split("\x00");
    const entries = decompressedTree.slice(1);
    if (flag === '--name-only') {
        const names = entries
            .filter((line) => line.includes(" "))
            .map((line) => line.split(" ")[1]).join('\n').concat('\n');
        process.stdout.write(names);
    } else {
        console.log(`${flag} is invalid`);
    }
}

function computeHash() {
    const fileName = process.argv[4];
    const file = fs.readFileSync(path.join(process.cwd(), fileName));
    const content = `blob ${file.length}\0${file.toString()}`;
    const compressedContent = zlib.deflateSync(content);
    const hashCode = generateHash(content);
    process.stdout.write(hashCode);
    const objDir = hashCode.slice(0, 2);
    const objFileName = hashCode.slice(2);
    const filePath = path.join(process.cwd(), ".git", "objects", objDir);
    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(filePath);
    }
    fs.writeFileSync(path.join(filePath, objFileName), compressedContent);
}

function viewObject() {
    const hash = process.argv[4];
    const objDir = hash.slice(0, 2);
    const objFileName = hash.slice(2);
    const filePath = path.join(process.cwd(), ".git", "objects", objDir, objFileName);
    const compressedFile = fs.readFileSync(filePath);
    const decompressedOutput = zlib.inflateSync(compressedFile).toString().split("\x00")[1].split("\n")[0];
    process.stdout.write(decompressedOutput);
}

function createGitDirectory() {
    fs.mkdirSync(path.join(process.cwd(), ".git"), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), ".git", "objects"), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), ".git", "refs"), { recursive: true });

    fs.writeFileSync(path.join(process.cwd(), ".git", "HEAD"), "ref: refs/heads/main\n");
    console.log("Initialized git directory");
}

function generateHash(file) {
    return createHash('sha1').update(file).digest('hex');
}