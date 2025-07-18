const {ipcMain, shell} = require("electron")
const childProcess = require("child_process")
const spawn = require("cross-spawn")
const process = require("process")
const path = require("path")
const os = require("os")
const fs = require("fs")
const gracefulfs = require("graceful-fs")
const https = require("https")
const EventEmitter = require("events")
const zip = require("node-stream-zip")
const crypto = require("crypto")

const {
    YakitProjectPath,
    remoteLinkDir,
    yaklangEngineDir,
    basicDir,
    remoteLinkFile,
    codeDir,
    loadExtraFilePath,
    yakitInstallDir
} = require("../filePath")
const {
    downloadYakitEE,
    downloadYakitCommunity,
    downloadIntranetYakit,
    downloadYakEngine,
    getDownloadUrl,
    getSuffix
} = require("./utils/network")
const {engineCancelRequestWithProgress, yakitCancelRequestWithProgress} = require("./utils/requestWithProgress")
const {getCheckTextUrl, fetchSpecifiedYakVersionHash} = require("../handlers/utils/network")
const {engineLogOutputFileAndUI} = require("../logFile")

const userChromeDataDir = path.join(YakitProjectPath, "chrome-profile")
const authMeta = []

const initMkbaseDir = async () => {
    return new Promise((resolve, reject) => {
        try {
            fs.mkdirSync(remoteLinkDir, {recursive: true})
            fs.mkdirSync(basicDir, {recursive: true})
            fs.mkdirSync(userChromeDataDir, {recursive: true})
            fs.mkdirSync(yaklangEngineDir, {recursive: true})
            fs.mkdirSync(codeDir, {recursive: true})

            try {
                console.info("Start checking bins/resources")
                const extraResources = loadExtraFilePath(path.join("bins", "resources"))
                const resourceBase = basicDir
                if (!fs.existsSync(path.join(resourceBase, "flag.txt"))) {
                    console.info("Start to load bins/resources ...")
                    fs.readdirSync(extraResources).forEach((value) => {
                        if (value.endsWith(".txt")) {
                            try {
                                fs.copyFileSync(path.join(extraResources, value), path.join(resourceBase, value))
                            } catch (e) {
                                console.info(e)
                            }
                        }
                    })
                }
            } catch (e) {
                console.error(e)
            }

            resolve()
        } catch (e) {
            reject(e)
        }
    })
}

const loadSecrets = () => {
    authMeta.splice(0, authMeta.length)
    try {
        const data = fs.readFileSync(path.join(remoteLinkDir, "yakit-remote.json"))
        JSON.parse(data).forEach((i) => {
            if (!(i["host"] && i["port"])) {
                return
            }

            authMeta.push({
                name: i["name"] || `${i["host"]}:${i["port"]}`,
                host: i["host"],
                port: i["port"],
                tls: i["tls"] || false,
                password: i["password"] || "",
                caPem: i["caPem"] || ""
            })
        })
    } catch (e) {}
}

function saveSecret(name, host, port, tls, password, caPem) {
    if (!host || !port) {
        throw new Error("empty host or port")
    }

    authMeta.push({
        host,
        port,
        tls,
        password,
        caPem,
        name: name || `${host}:${port}`
    })
    saveAllSecret([...authMeta])
}

const isWindows = process.platform === "win32"

const saveAllSecret = (authInfos) => {
    try {
        fs.unlinkSync(remoteLinkFile)
    } catch (e) {}

    const authFileStr = JSON.stringify([
        ...authInfos.filter((v, i, arr) => {
            return arr.findIndex((origin) => origin.name === v.name) === i
        })
    ])
    fs.writeFileSync(remoteLinkFile, new Buffer(authFileStr, "utf8"))
}

const getLatestYakLocalEngine = () => {
    switch (process.platform) {
        case "darwin":
        case "linux":
            return path.join(yaklangEngineDir, "yak")
        case "win32":
            return path.join(yaklangEngineDir, "yak.exe")
    }
}

// 获取Yakit所处平台
const getYakitPlatform = () => {
    const suffix = getSuffix()
    switch (process.platform) {
        case "darwin":
            if (process.arch === "arm64") {
                return `darwin${suffix}-arm64`
            } else {
                return `darwin${suffix}-x64`
            }
        case "win32":
            return `windows${suffix}-amd64`
        case "linux":
            return `linux${suffix}-amd64`
    }
}

module.exports = {
    getLatestYakLocalEngine,
    initial: async () => {
        return await initMkbaseDir()
    },
    register: (win, getClient) => {
        ipcMain.handle("save-yakit-remote-auth", async (e, params) => {
            let {name, host, port, tls, caPem, password} = params
            name = name || `${host}:${port}`
            saveAllSecret([
                ...authMeta.filter((i) => {
                    return i.name !== name
                })
            ])
            loadSecrets()
            saveSecret(name, host, port, tls, password, caPem)
        })
        ipcMain.handle("remove-yakit-remote-auth", async (e, name) => {
            saveAllSecret([
                ...authMeta.filter((i) => {
                    return i.name !== name
                })
            ])
            loadSecrets()
        })
        ipcMain.handle("get-yakit-remote-auth-all", async (e, name) => {
            loadSecrets()
            return authMeta
        })
        ipcMain.handle("get-yakit-remote-auth-dir", async (e, name) => {
            return remoteLinkDir
        })

        class YakVersionEmitter extends EventEmitter {}

        const yakVersionEmitter = new YakVersionEmitter()
        let isFetchingVersion = false
        let latestVersionCache = null

        /** clear latestVersionCache value */
        ipcMain.handle("clear-local-yaklang-version-cache", async (e) => {
            latestVersionCache = null
            return
        })

        // asyncQueryLatestYakEngineVersion wrapper
        const asyncGetCurrentLatestYakVersion = (params) => {
            return new Promise((resolve, reject) => {
                if (latestVersionCache) {
                    engineLogOutputFileAndUI(win, `----- 获取到yak版本(缓存): ${latestVersionCache} -----`)
                    resolve(latestVersionCache)
                    return
                }

                engineLogOutputFileAndUI(win, `----- 开始获取 yak 本地版本 -----`)
                console.info("YAK-VERSION: mount version")
                yakVersionEmitter.once("version", (err, version) => {
                    if (err) {
                        diagnosingYakVersion()
                            .catch((err) => {
                                console.info("YAK-VERSION(DIAG): fetch error: " + `${err}`)
                                reject(err)
                            })
                            .then(() => {
                                console.info("YAK-VERSION: fetch error: " + `${err}`)
                                reject(err)
                            })
                    } else {
                        console.info("YAK-VERSION: hit version: " + `${version}`)
                        resolve(version)
                    }
                })
                if (isFetchingVersion) {
                    console.info("YAK-VERSION is executing...")
                    return
                }

                console.info("YAK-VERSION process is executing...")
                isFetchingVersion = true
                const child = spawn(getLatestYakLocalEngine(), ["-v"], {timeout: 5200})
                let stdout = ""
                let stderr = ""
                let finished = false
                const timer = setTimeout(() => {
                    if (!finished) {
                        finished = true
                        child.kill()
                        try {
                            if (process.platform === "win32") {
                                childProcess.exec(`taskkill /PID ${child.pid} /T /F`)
                            } else {
                                process.kill(child.pid, "SIGKILL")
                            }
                        } catch (e) {
                        } finally {
                            const error = new Error("[yak -v] 获取版本超时，已强制终止")
                            engineLogOutputFileAndUI(win, error.toString())
                            yakVersionEmitter.emit("version", error, null)
                            isFetchingVersion = false
                        }
                    }
                }, 5000)
                child.stdout.on("data", (data) => {
                    stdout += data.toString("utf-8")
                })
                child.stderr.on("data", (data) => {
                    stderr += data.toString("utf-8")
                })
                child.on("error", (err) => {
                    if (finished) return
                    finished = true
                    clearTimeout(timer)
                    engineLogOutputFileAndUI(win, `${err.toString("utf-8")}`)
                    if (stderr) {
                        engineLogOutputFileAndUI(win, `${stderr}`)
                    }
                    yakVersionEmitter.emit("version", err, null)
                    isFetchingVersion = false
                })
                child.on("close", (code) => {
                    if (finished) return
                    engineLogOutputFileAndUI(win, `${stdout}`)
                    const match = /.*?yak(\.exe)?\s+version\s+(\S+)/.exec(stdout)
                    const version = match && match[2]
                    if (!version) {
                        engineLogOutputFileAndUI(win, "----- 引擎无法获取yak本地版本 -----")
                        if (code !== 0 || stderr) {
                            engineLogOutputFileAndUI(win, `${stderr}` || `Process exited with code ${code}`)
                            const error = new Error(`${stderr}` || `Process exited with code ${code}`)
                            yakVersionEmitter.emit("version", error, null)
                            isFetchingVersion = false
                        }
                    } else {
                        finished = true
                        clearTimeout(timer)
                        engineLogOutputFileAndUI(win, `----- 获取到yak本地版本: ${version}-----`)
                        latestVersionCache = version
                        yakVersionEmitter.emit("version", null, version)
                        isFetchingVersion = false
                    }
                })
            })
        }
        ipcMain.handle("get-current-yak", async (e, params) => {
            return await asyncGetCurrentLatestYakVersion(params)
        })

        const diagnosingYakVersion = () =>
            new Promise((resolve, reject) => {
                const commandPath = getLatestYakLocalEngine()
                fs.access(commandPath, fs.constants.X_OK, (err) => {
                    if (err) {
                        if (err.code === "ENOENT") {
                            engineLogOutputFileAndUI(win, `命令未找到: ${commandPath}`)
                            reject(new Error(`命令未找到: ${commandPath}`))
                        } else if (err.code === "EACCES") {
                            engineLogOutputFileAndUI(win, `命令无法执行(无权限): ${commandPath}`)
                            reject(new Error(`命令无法执行(无权限): ${commandPath}`))
                        } else {
                            engineLogOutputFileAndUI(win, `命令无法执行: ${commandPath}`)
                            reject(new Error(`命令无法执行: ${commandPath}`))
                        }
                        return
                    }

                    const child = spawn(commandPath, ["-v"], {timeout: 20200})
                    let stdout = ""
                    let stderr = ""
                    let finished = false
                    const timer = setTimeout(() => {
                        if (!finished) {
                            finished = true
                            child.kill()
                            try {
                                if (process.platform === "win32") {
                                    childProcess.exec(`taskkill /PID ${child.pid} /T /F`)
                                } else {
                                    process.kill(child.pid, "SIGKILL")
                                }
                            } catch (e) {
                            } finally {
                                let errorMessage = `命令执行超时，进程遭遇未知问题，需要用户在命令行中执行引擎调试: ${commandPath}\nStdout: ${stdout}\nStderr: ${stderr}`
                                engineLogOutputFileAndUI(win, `${errorMessage}`)
                                reject(new Error(errorMessage))
                            }
                        }
                    }, 20000)
                    child.stdout.on("data", (data) => {
                        stdout += data.toString()
                    })
                    child.stderr.on("data", (data) => {
                        stderr += data.toString()
                    })
                    child.on("error", (error) => {
                        if (finished) return
                        finished = true
                        clearTimeout(timer)
                        let errorMessage = `命令执行失败: ${error.message}\nStdout: ${stdout}\nStderr: ${stderr}`
                        if (error.code === "ENOENT") {
                            errorMessage = `无法执行命令，引擎未找到: ${commandPath}\nerror: ${error.message}\nStderr: ${stderr}`
                        } else if (error.killed) {
                            errorMessage = `引擎启动被系统强制终止，可能的原因为内存占用过多或系统退出或安全防护软件: ${commandPath}\nerror: ${error.message}\nStderr: ${stderr}`
                        } else if (error.signal) {
                            errorMessage = `引擎由于信号而终止: ${error.signal}\nStderr: ${stderr}`
                        }
                        engineLogOutputFileAndUI(win, `${errorMessage}`)
                        reject(new Error(errorMessage))
                    })
                    child.on("close", (code, signal) => {
                        if (finished) return
                        if (code !== 0) {
                            let errorMessage = `命令执行失败: 退出码 ${code}\nStdout: ${stdout}\nStderr: ${stderr}`
                            if (signal) {
                                errorMessage = `引擎由于信号而终止: ${signal}\nStderr: ${stderr}`
                            }
                            engineLogOutputFileAndUI(win, `${errorMessage}`)
                            reject(new Error(errorMessage))
                            return
                        }
                        if (stderr) {
                            engineLogOutputFileAndUI(win, `Stderr: ${stderr}`)
                            reject(new Error(stderr))
                            return
                        }
                        finished = true
                        clearTimeout(timer)
                        resolve(stdout)
                    })
                })
            })
        ipcMain.handle("diagnosing-yak-version", async (e, params) => {
            return diagnosingYakVersion()
        })

        // asyncDownloadLatestYak wrapper
        const asyncDownloadLatestYak = (version) => {
            return new Promise(async (resolve, reject) => {
                const dest = path.join(
                    yaklangEngineDir,
                    version.startsWith("dev/") ? "yak-" + version.replace("dev/", "dev-") : `yak-${version}`
                )
                try {
                    fs.unlinkSync(dest)
                } catch (e) {}
                await downloadYakEngine(
                    version,
                    dest,
                    (state) => {
                        win.webContents.send("download-yak-engine-progress", state)
                    },
                    resolve,
                    reject
                )
            })
        }
        ipcMain.handle("download-latest-yak", async (e, version) => {
            return await asyncDownloadLatestYak(version)
        })

        const asyncWriteEngineKeyToYakitProjects = async (version) => {
            return new Promise(async (resolve, reject) => {
                try {
                    if (process.platform === "darwin") {
                        const yakKeyFile = path.join(YakitProjectPath, "engine-sha256.txt")
                        // 先行删除
                        if (fs.existsSync(yakKeyFile)) {
                            fs.unlinkSync(yakKeyFile)
                        }
                        // macOS下正常下载引擎时注入
                        if (version) {
                            const hashData = await fetchSpecifiedYakVersionHash(version, {timeout: 2000})
                            fs.writeFileSync(yakKeyFile, hashData)
                        }
                        // macOS下解压内置引擎时注入
                        else {
                            const hashTxt = path.join("bins", "engine-sha256.txt")
                            if (fs.existsSync(loadExtraFilePath(hashTxt))) {
                                let hashData = fs.readFileSync(loadExtraFilePath(hashTxt)).toString("utf8")
                                // 去除换行符
                                hashData = (hashData || "").replace(/\r?\n/g, "")
                                // 去除首尾空格
                                hashData = hashData.trim()
                                fs.writeFileSync(yakKeyFile, hashData)
                            }
                        }
                    }
                    resolve()
                } catch (error) {
                    reject(error)
                }
            })
        }

        ipcMain.handle("write-engine-key-to-yakit-projects", async (e, version) => {
            return await asyncWriteEngineKeyToYakitProjects(version)
        })

        // 判断历史引擎版本是否存在以及正确性
        const asyncYakEngineVersionExistsAndCorrectness = (version) => {
            const dest = path.join(
                yaklangEngineDir,
                version.startsWith("dev/") ? "yak-" + version.replace("dev/", "dev-") : `yak-${version}`
            )
            return new Promise(async (resolve, reject) => {
                try {
                    const url = await getCheckTextUrl(version)
                    if (url === "") {
                        reject(`Unsupported platform: ${process.platform}`)
                    }

                    if (fs.existsSync(dest)) {
                        let rsp = https.get(url)
                        rsp.on("response", (rsp) => {
                            rsp.on("data", (data) => {
                                const onlineha = Buffer.from(data).toString("utf8")
                                const sum = crypto.createHash("sha256")
                                sum.update(fs.readFileSync(dest))
                                const localha = sum.digest("hex")
                                if (onlineha === localha) {
                                    resolve(true)
                                } else {
                                    resolve(false)
                                }
                            }).on("error", (err) => reject(err))
                        })
                        rsp.on("error", (err) => reject(err))
                        rsp.setTimeout(3000, () => {
                            // 设置请求超时时间为3秒
                            rsp.destroy() // 超时后中止请求
                            reject("Request timeout")
                        })
                    } else {
                        reject("Engine version directory does not exist")
                    }
                } catch (error) {
                    reject(error)
                }
            })
        }
        ipcMain.handle("yak-engine-version-exists-and-correctness", async (e, version) => {
            return await asyncYakEngineVersionExistsAndCorrectness(version)
        })
        ipcMain.handle("cancel-download-yak-engine-version", async (e, version) => {
            return await engineCancelRequestWithProgress(version)
        })

        // asyncDownloadLatestYakit wrapper
        async function asyncDownloadLatestYakit(version, type) {
            return new Promise(async (resolve, reject) => {
                const {isEnterprise, isIRify} = type
                const IRifyCE = isIRify && !isEnterprise
                const IRifyEE = isIRify && isEnterprise
                const YakitCE = !isIRify && !isEnterprise
                const YakitEE = !isIRify && isEnterprise
                // format version，下载的版本号里不能存在 V
                if (version.startsWith("v")) {
                    version = version.substr(1)
                }

                console.info("start to fetching download-url for yakit")
                let downloadUrl = ""
                if (IRifyCE) {
                    downloadUrl = await getDownloadUrl(version, "IRifyCE")
                } else if (IRifyEE) {
                    downloadUrl = await getDownloadUrl(version, "IRifyEE")
                } else if (YakitEE) {
                    downloadUrl = await getDownloadUrl(version, "YakitEE")
                } else {
                    downloadUrl = await getDownloadUrl(version, "YakitCE")
                }
                // 可能存在中文的下载文件夹，就判断下Downloads文件夹是否存在，不存在则新建一个
                if (!fs.existsSync(yakitInstallDir)) fs.mkdirSync(yakitInstallDir, {recursive: true})
                const dest = path.join(yakitInstallDir, path.basename(downloadUrl))
                try {
                    fs.unlinkSync(dest)
                } catch (e) {}

                console.info(`start to download yakit from ${downloadUrl} to ${dest}`)
                // 企业版下载
                if (YakitEE || IRifyEE) {
                    await downloadYakitEE(
                        version,
                        isIRify,
                        dest,
                        (state) => {
                            if (!!state) {
                                win.webContents.send("download-yakit-engine-progress", state)
                            }
                        },
                        resolve,
                        reject
                    )
                } else {
                    // 社区版下载
                    await downloadYakitCommunity(
                        version,
                        isIRify,
                        dest,
                        (state) => {
                            if (!!state) {
                                win.webContents.send("download-yakit-engine-progress", state)
                            }
                        },
                        resolve,
                        reject
                    )
                }
            })
        }

        ipcMain.handle("cancel-download-yakit-version", async (e) => {
            return await yakitCancelRequestWithProgress()
        })

        ipcMain.handle("download-latest-yakit", async (e, version, type) => {
            return await asyncDownloadLatestYakit(version, type)
        })

        const asyncDownloadLatestIntranetYakit = (filePath) => {
            return new Promise(async (resolve, reject) => {
                const dest = path.join(yakitInstallDir, path.basename(filePath))
                // 内网版下载
                await downloadIntranetYakit(
                    filePath,
                    dest,
                    (state) => {
                        if (!!state) {
                            win.webContents.send("download-yakit-engine-progress", state)
                        }
                    },
                    resolve,
                    reject
                )
            })
        }

        ipcMain.handle("download-latest-intranet-yakit", async (e, filePath) => {
            return await asyncDownloadLatestIntranetYakit(filePath)
        })

        ipcMain.handle("download-enpriTrace-latest-yakit", async (e, url) => {
            return await new Promise((resolve, reject) => {
                downloadIntranetYakitByDownloadUrl(resolve, reject, url)
            })
        })

        ipcMain.handle("update-enpritrace-info", async () => {
            return await {version: getYakitPlatform()}
        })

        ipcMain.handle("get-windows-install-dir", async (e) => {
            return getLatestYakLocalEngine()
            //systemRoot := os.Getenv("WINDIR")
            // 			if systemRoot == "" {
            // 				systemRoot = os.Getenv("windir")
            // 			}
            // 			if systemRoot == "" {
            // 				systemRoot = os.Getenv("SystemRoot")
            // 			}
            //
            // 			if systemRoot == "" {
            // 				return utils.Errorf("cannot fetch windows system root dir")
            // 			}
            //
            // 			installed = filepath.Join(systemRoot, "System32", "yak.exe")
            // if (process.platform !== "win32") {
            //     return "%WINDIR%\\System32\\yak.exe"
            // }
            // return getWindowsInstallPath();
        })

        const installYakEngine = (version) => {
            return new Promise((resolve, reject) => {
                let origin = path.join(
                    yaklangEngineDir,
                    version.startsWith("dev/") ? "yak-" + version.replace("dev/", "dev-") : `yak-${version}`
                )
                origin = origin.replaceAll(`"`, `\"`)

                let dest = getLatestYakLocalEngine() //;isWindows ? getWindowsInstallPath() : "/usr/local/bin/yak";
                dest = dest.replaceAll(`"`, `\"`)
                // setTimeout childProcess.exec执行顺序 确保childProcess.exec执行后不会再执行tryUnlink
                let flag = false
                function tryUnlink(retriesLeft) {
                    if (flag) return
                    try {
                        fs.unlinkSync(dest)
                    } catch (err) {
                        if (err.message.indexOf("operation not permitted") > -1) {
                            if (retriesLeft > 0) {
                                setTimeout(() => tryUnlink(retriesLeft - 1), 500)
                            } else {
                                reject("operation not permitted")
                            }
                        }
                    }
                }
                tryUnlink(2)
                childProcess.exec(
                    isWindows ? `copy "${origin}" "${dest}"` : `cp "${origin}" "${dest}" && chmod +x "${dest}"`,
                    (err) => {
                        flag = true
                        if (err) {
                            if (
                                err.message.indexOf(
                                    "The process cannot access the file because it is being used by another process"
                                ) !== -1
                            ) {
                                reject("operation not permitted")
                            } else {
                                reject(err)
                            }
                            return
                        }
                        resolve()
                    }
                )
            })
        }

        ipcMain.handle("install-yak-engine", async (e, version) => {
            return await installYakEngine(version)
        })

        // 获取yak code文件根目录路径
        ipcMain.handle("fetch-code-path", () => {
            return codeDir
        })

        // 打开指定路径文件
        ipcMain.handle("open-specified-file", async (e, path) => {
            return shell.showItemInFolder(path)
        })

        const generateInstallScript = () => {
            return new Promise((resolve, reject) => {
                const all = "auto-install-cert.zip"
                const output_name = isWindows ? `auto-install-cert.bat` : `auto-install-cert.sh`
                if (!fs.existsSync(loadExtraFilePath(path.join("bins/scripts", all)))) {
                    reject(all + " not found")
                    return
                }
                console.log("start to gen cert script")
                const zipHandler = new zip({
                    file: loadExtraFilePath(path.join("bins/scripts", all)),
                    storeEntries: true
                })
                zipHandler.on("ready", () => {
                    const targetPath = path.join(YakitProjectPath, output_name)
                    zipHandler.extract(output_name, targetPath, (err, res) => {
                        if (!fs.existsSync(targetPath)) {
                            reject(`Extract Cert Script Failed`)
                        } else {
                            // 如果不是 Windows，给脚本文件添加执行权限
                            if (!isWindows) {
                                fs.chmodSync(targetPath, 0o755)
                            }
                            resolve(targetPath)
                        }
                        zipHandler.close()
                    })
                })
                zipHandler.on("error", (err) => {
                    console.info(err)
                    reject(`${err}`)
                    zipHandler.close()
                })
            })
        }

        ipcMain.handle("generate-install-script", async (e) => {
            return await generateInstallScript()
        })

        // asyncInitBuildInEngine wrapper
        const asyncInitBuildInEngine = (params) => {
            return new Promise((resolve, reject) => {
                if (!fs.existsSync(loadExtraFilePath(path.join("bins", "yak.zip")))) {
                    reject("BuildIn Engine Not Found!")
                    return
                }

                console.info("Start to Extract yak.zip")
                const zipHandler = new zip({
                    file: loadExtraFilePath(path.join("bins", "yak.zip")),
                    storeEntries: true
                })
                console.info("Start to Extract yak.zip: Set `ready`")
                zipHandler.on("ready", () => {
                    const buildInPath = path.join(yaklangEngineDir, "yak.build-in")

                    console.log("Entries read: " + zipHandler.entriesCount)
                    for (const entry of Object.values(zipHandler.entries())) {
                        const desc = entry.isDirectory ? "directory" : `${entry.size} bytes`
                        console.log(`Entry ${entry.name}: ${desc}`)
                    }

                    console.info("we will extract file to: " + buildInPath)
                    const extractedFile = (() => {
                        switch (os.platform()) {
                            case "darwin":
                                switch (os.arch()) {
                                    case "arm64":
                                        return "bins/yak_darwin_arm64"
                                    default:
                                        return "bins/yak_darwin_amd64"
                                }
                            case "win32":
                                return "bins/yak_windows_amd64.exe"
                            case "linux":
                                switch (os.arch()) {
                                    case "arm64":
                                        return "bins/yak_linux_arm64"
                                    default:
                                        return "bins/yak_linux_amd64"
                                }
                            default:
                                return ""
                        }
                    })()
                    zipHandler.extract(extractedFile, buildInPath, (err, res) => {
                        if (!fs.existsSync(buildInPath)) {
                            reject(`Extract BuildIn Engine Failed`)
                        } else {
                            /**
                             * 复制引擎到真实地址
                             * */
                            try {
                                let targetEngine = path.join(yaklangEngineDir, isWindows ? "yak.exe" : "yak")
                                if (!isWindows) {
                                    gracefulfs.copyFileSync(buildInPath, targetEngine)
                                    fs.chmodSync(targetEngine, 0o755)
                                } else {
                                    gracefulfs.copyFileSync(buildInPath, targetEngine)
                                }
                                resolve()
                            } catch (e) {
                                reject(e)
                            }
                        }
                        console.info("zipHandler closing...")
                        zipHandler.close()
                    })
                })
                console.info("Start to Extract yak.zip: Set `error`")
                zipHandler.on("error", (err) => {
                    console.info(err)
                    reject(`${err}`)
                    zipHandler.close()
                })
            })
        }

        // 尝试初始化数据库
        ipcMain.handle("InitCVEDatabase", async (e) => {
            const targetFile = path.join(YakitProjectPath, "default-cve.db.gzip")
            if (fs.existsSync(targetFile)) {
                return
            }
            const buildinDBFile = loadExtraFilePath(path.join("bins", "database", "default-cve.db.gzip"))
            if (fs.existsSync(buildinDBFile)) {
                fs.copyFileSync(buildinDBFile, targetFile)
            }
        })

        // 获取内置引擎版本
        ipcMain.handle(
            "GetBuildInEngineVersion",
            /*"IsBinsExisted"*/ async (e) => {
                const yakZipPath = path.join("bins", "yak.zip")
                if (!fs.existsSync(loadExtraFilePath(yakZipPath))) {
                    throw Error(`Cannot found yak.zip, bins: ${loadExtraFilePath(yakZipPath)}`)
                }
                const versionPath = path.join("bins", "engine-version.txt")
                let buildInVersion = fs.readFileSync(loadExtraFilePath(versionPath)).toString("utf8")
                // 去除换行符
                buildInVersion = (buildInVersion || "").replace(/\r?\n/g, "")
                // 去除首尾空格
                buildInVersion = buildInVersion.trim()
                return buildInVersion
            }
        )

        // asyncRestoreEngineAndPlugin wrapper
        ipcMain.handle("RestoreEngineAndPlugin", async (e, params) => {
            latestVersionCache = null
            const engineTarget = isWindows ? path.join(yaklangEngineDir, "yak.exe") : path.join(yaklangEngineDir, "yak")
            const buidinEngine = path.join(yaklangEngineDir, "yak.build-in")
            const cacheFlagLock = path.join(basicDir, "flag.txt")
            try {
                // remove old engine
                if (fs.existsSync(buidinEngine)) {
                    fs.unlinkSync(buidinEngine)
                }
                if (isWindows && fs.existsSync(engineTarget)) {
                    // access write will fetch delete!
                    fs.accessSync(engineTarget, fs.constants.F_OK | fs.constants.W_OK)
                }

                if (fs.existsSync(cacheFlagLock)) {
                    fs.unlinkSync(cacheFlagLock)
                }
            } catch (e) {
                throw e
            }

            function tryUnlink(retriesLeft) {
                try {
                    if (fs.existsSync(engineTarget)) {
                        fs.unlinkSync(engineTarget)
                    }
                } catch (err) {
                    if (err.message.indexOf("operation not permitted") > -1) {
                        if (retriesLeft > 0) {
                            setTimeout(() => tryUnlink(retriesLeft - 1), 500)
                        } else {
                            throw e
                        }
                    }
                }
            }
            tryUnlink(2)
            return await asyncInitBuildInEngine({})
        })

        // 解压 start-engine.zip
        const generateStartEngineGRPC = () => {
            return new Promise((resolve, reject) => {
                const all = "start-engine.zip"
                const output_name = isWindows ? `start-engine-grpc.bat` : `start-engine-grpc.sh`

                // 如果存在就不在解压
                if (fs.existsSync(path.join(yaklangEngineDir, output_name))) {
                    resolve("")
                    return
                }

                if (!fs.existsSync(loadExtraFilePath(path.join("bins/scripts", all)))) {
                    reject(all + " not found")
                    return
                }
                const zipHandler = new zip({
                    file: loadExtraFilePath(path.join("bins/scripts", all)),
                    storeEntries: true
                })
                zipHandler.on("ready", () => {
                    const targetPath = path.join(yaklangEngineDir, output_name)
                    zipHandler.extract(output_name, targetPath, (err, res) => {
                        if (!fs.existsSync(targetPath)) {
                            reject(`Extract Start Engine GRPC Script Failed`)
                        } else {
                            // 如果不是 Windows，给脚本文件添加执行权限
                            if (!isWindows) {
                                fs.chmodSync(targetPath, 0o755)
                            }
                            resolve("")
                        }
                        zipHandler.close()
                    })
                })
                zipHandler.on("error", (err) => {
                    console.info(err)
                    reject(`${err}`)
                    zipHandler.close()
                })
            })
        }

        ipcMain.handle("generate-start-engine", async (e) => {
            return await generateStartEngineGRPC()
        })

        // 插件压缩包和解压目录
        const generateChromePlugin = () => {
            return new Promise((resolve, reject) => {
                const zipFilePath = loadExtraFilePath(path.join("bins/scripts", "google-chrome-plugin.zip"))
                const targetPath = path.join(YakitProjectPath, "google-chrome-plugin")

                // 确保压缩包存在
                if (!fs.existsSync(zipFilePath)) {
                    reject(zipFilePath + " not found")
                    return
                }

                // 确保输出文件夹存在，不存在则进行创建
                if (!fs.existsSync(targetPath)) {
                    fs.mkdirSync(targetPath, {recursive: true})
                }

                const zipHandler = new zip({
                    file: zipFilePath,
                    storeEntries: true
                })

                zipHandler.on("ready", () => {
                    // 执行解压
                    zipHandler.extract(null, targetPath, (err, res) => {
                        if (err) {
                            reject(`Extract Google Chrome Plugin Failed: ${err}`)
                        } else {
                            resolve(targetPath)
                        }
                        zipHandler.close()
                    })
                })

                zipHandler.on("error", (err) => {
                    reject(`Zip error: ${err}`)
                    zipHandler.close()
                })
            })
        }

        ipcMain.handle("generate-chrome-plugin", async (e) => {
            return await generateChromePlugin()
        })
    }
}
