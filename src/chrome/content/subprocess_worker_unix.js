/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public
 * License Version 1.1 (the "MPL"); you may not use this file
 * except in compliance with the MPL. You may obtain a copy of
 * the MPL at http://www.mozilla.org/MPL/
 *
 * Software distributed under the MPL is distributed on an "AS
 * IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the MPL for the specific language governing
 * rights and limitations under the MPL.
 *
 * The Original Code is subprocess.jsm.
 *
 * The Initial Developer of this code is Patrick Brunschwig.
 * Portions created by Patrick Brunschwig <patrick@enigmail.net>
 * are Copyright (C) 2011 Patrick Brunschwig.
 * All Rights Reserved.
 *
 * Contributor(s):
 * Jan Gerber <j@mailb.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * ***** END LICENSE BLOCK ***** */

/*
 * ChromeWorker Object subprocess.jsm on Unix-like systems (Linux, Mac OS X, ...)
 * to process stdin/stdout/stderr on separate threads.
 *
 */

// Being a ChromeWorker object, implicitly uses the following:
// Components.utils.import("resource://gre/modules/ctypes.jsm");

'use strict';

const BufferSize = 1024;

var libc = null;
var libcFunc = {};


/*
    struct pollfd {
         int    fd;       // file descriptor
         short  events;   // events to look for
         short  revents;  // events returned
     };
*/

var pollfd = new ctypes.StructType("pollfd",
                        [   {'fd': ctypes.int},
                            {'events': ctypes.short},
                            {'revents': ctypes.short}
                        ]);

var WriteBuffer = ctypes.uint8_t.array(BufferSize);
var ReadBuffer = ctypes.char.array(BufferSize);


const POLLIN     = 0x0001;
const POLLOUT    = 0x0004;

const POLLERR    = 0x0008;         // some poll error occurred
const POLLHUP    = 0x0010;         // file descriptor was "hung up"
const POLLNVAL   = 0x0020;         // requested events "invalid"

const WNOHANG    = 0x01;

const ECHILD = 10;

const pid_t = ctypes.int32_t;

const INDEFINITE = -1;
const NOWAIT     = 0;
const WAITTIME   = 200;  // wait time for poll() in ms

function initLibc(libName) {
    postMessage({msg: "debug", data: "initialising library with "+ libName});

    libc = ctypes.open(libName);

    libcFunc.pollFds = pollfd.array(1);

    // int poll(struct pollfd fds[], nfds_t nfds, int timeout);
    libcFunc.poll = libc.declare("poll",
                                  ctypes.default_abi,
                                  ctypes.int,
                                  libcFunc.pollFds,
                                  ctypes.unsigned_int,
                                  ctypes.int);

    //ssize_t write(int fd, const void *buf, size_t count);
    // NOTE: buf is declared as array of unsigned int8 instead of char to avoid
    // implicit charset conversion
    libcFunc.write = libc.declare("write",
                                  ctypes.default_abi,
                                  ctypes.int,
                                  ctypes.int,
                                  WriteBuffer,
                                  ctypes.int);

    //int read(int fd, void *buf, size_t count);
    libcFunc.read = libc.declare("read",
                                  ctypes.default_abi,
                                  ctypes.int,
                                  ctypes.int,
                                  ReadBuffer,
                                  ctypes.int);

    //int pipe(int pipefd[2]);
    libcFunc.pipefd = ctypes.int.array(2);

    //int close(int fd);
    libcFunc.close = libc.declare("close",
                                  ctypes.default_abi,
                                  ctypes.int,
                                  ctypes.int);

    //pid_t waitpid(pid_t pid, int *status, int options);
    libcFunc.waitpid = libc.declare("waitpid",
                                  ctypes.default_abi,
                                  pid_t,
                                  pid_t,
                                  ctypes.int.ptr,
                                  ctypes.int);
}

function closePipe(pipe) {
    libcFunc.close(pipe);
}

function writePipe(pipe, data) {

    postMessage({msg: "debug", data: "trying to write to "+pipe});

    let numChunks = Math.floor(data.length / BufferSize);
    let pData = new WriteBuffer();

    for (var chunk = 0; chunk <= numChunks; chunk ++) {
        let numBytes = chunk < numChunks ? BufferSize : data.length - chunk * BufferSize;
        for (var i=0; i < numBytes; i++) {
            pData[i] = data.charCodeAt(chunk * BufferSize + i) % 256;
        }

        let bytesWritten = libcFunc.write(pipe, pData, numBytes);
        if (bytesWritten != numBytes) {
            closePipe(pipe);
            libc.close();
            postMessage({ msg: "error", data: "error: wrote "+bytesWritten+" instead of "+numBytes+" bytes"});
            close();
        }
    }
    postMessage({msg: "info", data: "wrote "+data.length+" bytes of data"});
}


function readString(data, length, charset) {
    var r = '';
    for(var i = 0; i < length; i++) {
        if(data[i] == 0 && charset != "null") // stop on NULL character for non-binary data
           break;

        r += String.fromCharCode(data[i]);
    }

    return r;
}

function readPipe(pipe, charset, pid, bufferedOutput) {
    var p = new libcFunc.pollFds;
    p[0].fd = pipe;
    p[0].events = POLLIN | POLLERR | POLLHUP;
    p[0].revents = 0;
    var pollTimeout = WAITTIME;
    var exitCode = -1;
    var readCount = 0;
    var result, status = ctypes.int();
    result = 0;

    var dataStr = "";
    var dataObj = {};

    const i=0;
    while (true) {
        if (result == 0) {
            result = libcFunc.waitpid(pid, status.address(), WNOHANG);
            if (result > 0) {
                pollTimeout = NOWAIT;
                exitCode = parseInt(status.value);
                postMessage({msg: "debug", data: "waitpid signaled subprocess stop, exitcode="+status.value });
            }
            else if (result < 0) {
              postMessage({msg: "debug", data: "waitpid returned with errno="+ctypes.errno });
              if (ctypes.errno == ECHILD) {
                pollTimeout = NOWAIT;
              }
            }
        }
        p[i].revents = 0;
        var r = libcFunc.poll(p, 1, pollTimeout);
        if (pollTimeout == NOWAIT) {
          readCount = 0;
        }
        if (r > 0) {
            if (p[i].revents & POLLIN) {
                // postMessage({msg: "debug", data: "reading next chunk"});

                readCount = readPolledFd(p[i].fd, charset, dataObj);
                if (! bufferedOutput)
                  postMessage({msg: "data", data: dataObj.value, count: dataObj.value.length});
                else
                  dataStr += dataObj.value;

                if (readCount == 0) break;
            }

            if (p[i].revents & POLLHUP) {
                postMessage({msg: "debug", data: "poll returned HUP"});
                break;
            }
            else if (p[i].revents & POLLERR) {
                postMessage({msg: "error", data: "poll returned error"});
                break;
            }
            else if (p[i].revents != POLLIN) {
                postMessage({msg: "error", data: "poll returned "+p[i]});
                break;
            }
        }
        else
            if (pollTimeout == NOWAIT || r < 0) break;
    }

    // continue reading until the buffer is empty
    while (readCount > 0) {
      readCount = readPolledFd(pipe, charset, dataObj);
      if (! bufferedOutput)
        postMessage({msg: "data", data: dataObj.value, count: dataObj.value.length});
      else
        dataStr += dataObj.value;

      let r = libcFunc.poll(p, 1, NOWAIT);
    }

    if (bufferedOutput)
      postMessage({msg: "data", data: dataStr, count: dataStr.length});

    closePipe(pipe);
    postMessage({msg: "done", data: exitCode });
    libc.close();
    close();
}

function readPolledFd(pipe, charset, dataObj) {
    var line = new ReadBuffer();
    var r = libcFunc.read(pipe, line, BufferSize);

    if (r > 0) {
        var c = readString(line, r, charset);
        dataObj.value = c;
    }
    else
       dataObj.value = "";

    return r;
}

onmessage = function (event) {
    switch (event.data.msg) {
    case "init":
        initLibc(event.data.libc);
        break;
    case "read":
        initLibc(event.data.libc);
        readPipe(event.data.pipe, event.data.charset, event.data.pid, event.data.bufferedOutput);
        break;
    case "write":
        // data contents:
        //   msg: 'write'
        //   data: the data (string) to write
        //   pipe: ptr to pipe
        writePipe(event.data.pipe, event.data.data);
        postMessage({msg: "info", data: "WriteOK"});
        break;
    case "close":
        postMessage({msg: "debug", data: "closing stdin\n"});

        closePipe(event.data.pipe);
        postMessage({msg: "info", data: "ClosedOK"});
        break;
    case "stop":
        libc.close(); // do not use libc after this point
        close();
        break;
    default:
        throw("error: Unknown command"+event.data.msg+"\n");
    }
    return;
};
